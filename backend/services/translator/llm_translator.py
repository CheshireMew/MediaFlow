
import json
import hashlib
import time
from pathlib import Path
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field
import instructor
from openai import OpenAI
from loguru import logger
from backend.models.schemas import SubtitleSegment
from backend.config import settings

# --- Schemas for Structured Output ---

class TranslatorSegment(BaseModel):
    id: str = Field(..., description="Original subtitle ID — must match input exactly")
    text: str = Field(..., description="Translated text")

class IntelligentSegment(BaseModel):
    """Segment for intelligent mode (N-to-M mapping)"""
    text: str = Field(..., description="Translated and potentially merged/split text")
    time_percentage: float = Field(..., description="Estimated percentage of the total time block this segment occupies (0.0 to 1.0)")

class TranslationResponse(BaseModel):
    """Standard 1-to-1 translation response"""
    segments: List[TranslatorSegment] = Field(..., description="Translated segments — count and IDs MUST match input exactly")

class IntelligentTranslationResponse(BaseModel):
    """Intelligent N-to-M translation response"""
    segments: List[IntelligentSegment] = Field(..., description="List of semantic segments. Number of segments can differ from input.")

# --- Translation Cache ---

CACHE_DIR = settings.TEMP_DIR / "translation_cache"
CACHE_MAX_AGE_DAYS = 7
CONTEXT_OVERLAP = 3  # Number of lines from previous batch to include as context

MAX_CORRECTION_ROUNDS = 2  # 1 initial + 2 corrections = 3 total LLM calls
MAX_CONSECUTIVE_BATCH_FAILURES = 2


class TranslationCache:
    """Disk-based translation cache keyed by content hash + model + language."""

    def __init__(self):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key(texts: Dict[str, str], model: str, language: str, mode: str) -> str:
        """Stable hash from segment texts + model + language + mode."""
        payload = json.dumps(texts, sort_keys=True, ensure_ascii=False)
        raw = f"{payload}|{model}|{language}|{mode}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, texts: Dict[str, str], model: str, language: str, mode: str) -> Optional[Dict[str, str]]:
        """Return cached id→translated_text dict, or None."""
        key = self._key(texts, model, language, mode)
        path = CACHE_DIR / f"{key}.json"
        if path.exists():
            try:
                age_days = (time.time() - path.stat().st_mtime) / 86400
                if age_days > CACHE_MAX_AGE_DAYS:
                    path.unlink(missing_ok=True)
                    return None
                data = json.loads(path.read_text("utf-8"))
                logger.debug(f"[Cache] HIT for {len(texts)} segments ({key[:12]}...)")
                return data
            except Exception:
                return None
        return None

    def put(self, texts: Dict[str, str], model: str, language: str, mode: str, result: Dict[str, str]):
        key = self._key(texts, model, language, mode)
        path = CACHE_DIR / f"{key}.json"
        try:
            path.write_text(json.dumps(result, ensure_ascii=False), "utf-8")
        except Exception as e:
            logger.warning(f"[Cache] Failed to write: {e}")

    def cleanup(self):
        """Remove expired cache files."""
        try:
            now = time.time()
            for p in CACHE_DIR.glob("*.json"):
                if (now - p.stat().st_mtime) / 86400 > CACHE_MAX_AGE_DAYS:
                    p.unlink(missing_ok=True)
        except Exception:
            pass


# --- Translator ---

class LLMTranslator:
    def __init__(self):
        self._cache = TranslationCache()
        self.model = settings.LLM_MODEL

    def _get_client(self):
        """Dynamically construct the OpenAI client based on active settings."""
        from backend.core.container import container, Services
        settings_manager = container.get(Services.SETTINGS_MANAGER)

        provider = settings_manager.get_active_llm_provider()
        if not provider:
            logger.error("No active LLM provider found in settings.")
            return None, None

        client = instructor.patch(OpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url
        ))
        return client, provider.model

    # --- Validation ---

    def _validate_response(
        self, resp: TranslationResponse, segments: List[SubtitleSegment]
    ) -> tuple[bool, str, List[SubtitleSegment]]:
        expected_ids = [str(s.id) for s in segments]
        id_to_text = {s.id: s.text for s in resp.segments}

        if set(id_to_text.keys()) == set(expected_ids) and len(resp.segments) == len(segments):
            result = [self._map_seg(orig, id_to_text[str(orig.id)]) for orig in segments]
            return True, "", result

        if len(resp.segments) == len(segments):
            logger.warning(f"IDs differ but count matches ({len(segments)}). Positional mapping.")
            result = [self._map_seg(orig, resp.segments[i].text) for i, orig in enumerate(segments)]
            return True, "", result

        missing = [id for id in expected_ids if id not in id_to_text]
        extra = [id for id in id_to_text if id not in expected_ids]
        error = f"Expected {len(segments)} segments but got {len(resp.segments)}."
        if missing:
            error += f" Missing IDs: {missing}."
        if extra:
            error += f" Extra IDs: {extra}."
        error += f" You MUST return exactly {len(segments)} segments with IDs: {expected_ids}."
        return False, error, []

    @staticmethod
    def _map_seg(original: SubtitleSegment, translated_text: str) -> SubtitleSegment:
        new = original.model_copy()
        new.text = translated_text
        return new

    # --- Single-line fallback ---

    def _translate_single_fallback(
        self, client, model_name: str, segments: List[SubtitleSegment], target_language: str, mode_label: str
    ) -> List[SubtitleSegment]:
        """Translate one segment at a time as last resort."""
        logger.warning(f"[LLM] {mode_label}: falling back to single-line translation for {len(segments)} segments")
        result = []
        for seg in segments:
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=TranslationResponse,
                    messages=[
                        {"role": "system", "content": f"Translate the following subtitle line to {target_language}. Return ONLY the translation, nothing else."},
                        {"role": "user", "content": json.dumps({str(seg.id): seg.text}, ensure_ascii=False)}
                    ],
                    temperature=0.3
                )
                if resp.segments:
                    result.append(self._map_seg(seg, resp.segments[0].text))
                else:
                    result.append(seg)
            except Exception as e:
                logger.warning(f"[LLM] Single-line failed for [{seg.id}]: {e}")
                result.append(seg)
        return result

    # --- Shared correction loop ---

    def _translate_with_correction(
        self,
        client,
        model_name: str,
        system_prompt: str,
        segments: List[SubtitleSegment],
        input_json_str: str,
        target_language: str,
        mode_label: str = "Standard",
    ) -> List[SubtitleSegment]:
        """
        LLM call → validate → if mismatch, send error back → retry.
        After MAX_CORRECTION_ROUNDS failures, fall back to single-line translation.
        """
        n = len(segments)
        ids = [str(s.id) for s in segments]

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_json_str}
        ]

        last_resp = None
        for round_idx in range(1 + MAX_CORRECTION_ROUNDS):
            resp = client.chat.completions.create(
                model=model_name,
                response_model=TranslationResponse,
                messages=messages,
                temperature=0.3
            )
            last_resp = resp
            logger.info(f"[LLM IO] {mode_label} round {round_idx}: input {n}, output {len(resp.segments)}")

            is_valid, error_msg, mapped = self._validate_response(resp, segments)
            if is_valid:
                return mapped

            logger.warning(f"[LLM] {mode_label} validation failed (round {round_idx}): {error_msg}")
            messages.append({"role": "assistant", "content": resp.model_dump_json()})
            messages.append({
                "role": "user",
                "content": f"Error: {error_msg}\n\nFix the errors and output exactly {n} segments with IDs: {ids}"
            })

        # Correction rounds exhausted → entire batch goes to single-line fallback
        # Do NOT use partial mapping: LLM may have merged segments, making those entries unreliable
        logger.warning(f"[LLM] {mode_label}: correction exhausted, falling back to single-line for all {n} segments")
        return self._translate_single_fallback(client, model_name, segments, target_language, mode_label)

    # --- Mode dispatching ---

    def _translate_batch_struct(
        self,
        segments: List[SubtitleSegment],
        target_language: str,
        mode: Literal["standard", "proofread", "intelligent"],
        context_before: Optional[List[SubtitleSegment]] = None,
    ) -> List[SubtitleSegment]:
        """Internal batch translation using structured output."""
        client, model_name = self._get_client()
        if not client:
            raise ValueError("LLM Client not initialized (Check Settings)")

        subtitle_dict = {str(s.id): s.text for s in segments}
        n = len(segments)

        # --- Cache check ---
        if mode in ("standard", "proofread"):
            cached = self._cache.get(subtitle_dict, model_name, target_language, mode)
            if cached:
                return [self._map_seg(seg, cached.get(str(seg.id), seg.text)) for seg in segments]

        # --- Build user content with optional context ---
        if context_before and mode != "intelligent":
            context_lines = {str(s.id): s.text for s in context_before}
            user_content = (
                f"[CONTEXT — previous lines for reference only, do NOT translate these]\n"
                f"{json.dumps(context_lines, ensure_ascii=False)}\n\n"
                f"[TRANSLATE — translate these {n} entries]\n"
                f"{json.dumps(subtitle_dict, ensure_ascii=False)}"
            )
        else:
            user_content = json.dumps(subtitle_dict, ensure_ascii=False)

        # --- Glossary ---
        from backend.core.container import container, Services
        glossary_service = container.get(Services.GLOSSARY)
        relevant_terms = glossary_service.get_relevant_terms(" ".join(subtitle_dict.values()))

        system_prompt = f"You are a professional subtitle translator translating to {target_language}."
        system_prompt += "\nThe source text is transcribed from audio and may contain errors. Use context to correct errors during translation."

        if relevant_terms:
            glossary_block = "\nGLOSSARY (Strictly follow these translations):\n"
            for term in relevant_terms:
                glossary_block += f"- {term.source} -> {term.target}\n"
                if term.note:
                    glossary_block += f"  (Note: {term.note})\n"
            system_prompt += glossary_block

        # --- Standard ---
        if mode == "standard":
            ctx_note = "\nNote: Lines under [CONTEXT] are for reference only. Only translate lines under [TRANSLATE]." if context_before else ""
            system_prompt += f"""
MODE: STANDARD (Strict 1-to-1)
Rules:
1. Input is a JSON dict with {n} entries. You MUST output exactly {n} segments.
2. Preserve the exact 'id' from input — do NOT renumber.
3. Translate ONLY the text. Never merge or split lines, even if incomplete.
4. Fragments stay as fragments.
{ctx_note}
Example:
Input: {{"1": "Hello everyone", "2": "welcome to", "3": "our channel"}}
Correct output has 3 segments: {{"1": "大家好", "2": "欢迎来到", "3": "我们的频道"}}
Wrong (merged): {{"1": "大家好，欢迎来到我们的频道"}} ← NEVER do this
"""
            result = self._translate_with_correction(
                client, model_name, system_prompt, segments, user_content, target_language, "Standard"
            )
            # Cache successful result
            self._cache.put(subtitle_dict, model_name, target_language, mode, {str(s.id): s.text for s in result})
            return result

        # --- Proofread ---
        elif mode == "proofread":
            ctx_note = "\nNote: Lines under [CONTEXT] are for reference only. Only proofread lines under [TRANSLATE]." if context_before else ""
            system_prompt += f"""
MODE: PROOFREAD (Grammar & Correction)
Rules:
1. The source is a speech transcription with potential typos, wrong words, or missing punctuation.
2. CORRECT the text (grammar, spelling, punctuation) while keeping the MEANING and LANGUAGE the same.
3. Input has {n} entries. You MUST output exactly {n} segments with the same IDs.
4. Do NOT translate. Keep the original language.
{ctx_note}"""
            result = self._translate_with_correction(
                client, model_name, system_prompt, segments, user_content, target_language, "Proofread"
            )
            self._cache.put(subtitle_dict, model_name, target_language, mode, {str(s.id): s.text for s in result})
            return result

        # --- Intelligent ---
        elif mode == "intelligent":
            system_prompt += f"""
MODE: INTELLIGENT (Semantic Resegmentation)
Rules:
1. You are allowed to MERGE short, fragmented lines into complete sentences.
2. You are allowed to SPLIT long, run-on sentences into readable chunks.
3. Goal: readability and natural flow in {target_language}.
4. For each segment, provide 'time_percentage' (0.0-1.0) representing its portion of total duration.
"""
            resp = client.chat.completions.create(
                model=model_name,
                response_model=IntelligentTranslationResponse,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.7
            )

            logger.info(f"[LLM IO] Intelligent: input {len(segments)} -> output {len(resp.segments)}")

            total_start = segments[0].start
            total_end = segments[-1].end
            total_duration = total_end - total_start
            total_pct = sum(s.time_percentage for s in resp.segments) or 1.0
            start_id = int(segments[0].id) if str(segments[0].id).isdigit() else 0

            new_segments = []
            current_time = total_start
            for i, seg in enumerate(resp.segments):
                duration = (seg.time_percentage / total_pct) * total_duration
                seg_start = current_time
                seg_end = current_time + duration
                if i == len(resp.segments) - 1:
                    seg_end = total_end
                new_segments.append(SubtitleSegment(
                    id=str(start_id + i),
                    text=seg.text,
                    start=round(seg_start, 3),
                    end=round(seg_end, 3)
                ))
                current_time = seg_end
            return new_segments

        return segments

    # --- Orchestrator ---

    def translate_segments(
        self,
        segments: List[SubtitleSegment],
        target_language: str,
        mode: str = "standard",
        batch_size: int = 10,
        progress_callback=None
    ) -> List[SubtitleSegment]:
        """Orchestrates batch translation with context overlap."""
        if not segments:
            logger.warning("[Translate] Received empty segments list.")
            return []

        # Periodic cache cleanup
        self._cache.cleanup()

        translated_segments = []
        total_batches = (len(segments) + batch_size - 1) // batch_size
        effective_mode = mode if mode in ["standard", "intelligent", "proofread"] else "standard"
        consecutive_failures = 0
        last_batch_error: Exception | None = None

        logger.info(f"Starting translation: {len(segments)} segments, mode={effective_mode}, batch_size={batch_size}, batches={total_batches}")

        prev_batch: Optional[List[SubtitleSegment]] = None

        for i in range(0, len(segments), batch_size):
            batch = segments[i:i + batch_size]
            batch_num = i // batch_size + 1

            if progress_callback:
                progress_callback(
                    int(((batch_num - 1) / total_batches) * 100),
                    f"Translating batch {batch_num}/{total_batches} ({effective_mode})..."
                )

            # Context: last N lines from previous batch
            context = prev_batch[-CONTEXT_OVERLAP:] if prev_batch else None

            try:
                result = self._translate_batch_struct(batch, target_language, effective_mode, context_before=context)
                translated_segments.extend(result)
                consecutive_failures = 0
                last_batch_error = None
            except Exception as e:
                logger.error(f"[Translate] Batch {batch_num} failed: {e}. Falling back to source text.")
                translated_segments.extend(batch)
                consecutive_failures += 1
                last_batch_error = e

                if consecutive_failures >= MAX_CONSECUTIVE_BATCH_FAILURES or total_batches == 1:
                    raise RuntimeError(
                        "Translation failed after consecutive LLM batch errors. "
                        f"Last error: {e}"
                    ) from e

            prev_batch = batch

        # Re-index IDs for intelligent mode
        if effective_mode == "intelligent":
            for i, seg in enumerate(translated_segments):
                seg.id = str(i + 1)

        logger.info(f"[Translate] Done. Total segments: {len(translated_segments)}")

        if progress_callback:
            progress_callback(100, "Translation completed")

        return translated_segments

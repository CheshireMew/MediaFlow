
import json
import hashlib
import time
from pathlib import Path
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field
from loguru import logger
from backend.models.schemas import SubtitleSegment
from backend.config import settings

# --- Schemas for Structured Output ---

class TranslatorSegment(BaseModel):
    id: str = Field(..., description="Original subtitle ID — must match input exactly")
    source_text: str = Field(..., description="Original source subtitle text — must match input exactly")
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
    def __init__(self, *, settings_manager, glossary_service):
        self._cache = TranslationCache()
        self.model = settings.LLM_MODEL
        self._settings_manager = settings_manager
        self._glossary_service = glossary_service

    def _get_client(self):
        """Dynamically construct the OpenAI client based on active settings."""
        import instructor
        from openai import OpenAI

        provider = self._settings_manager.get_active_llm_provider()
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
        expected_source_texts = [s.text for s in segments]
        response_ids = [str(s.id) for s in resp.segments]
        response_source_texts = [s.source_text for s in resp.segments]
        duplicate_ids = sorted({segment_id for segment_id in response_ids if response_ids.count(segment_id) > 1})

        if duplicate_ids:
            error = (
                f"Expected unique segment IDs matching {expected_ids}, "
                f"but received duplicate IDs: {duplicate_ids}."
            )
            return False, error, []

        empty_text_ids = [
            str(segment.id)
            for segment in resp.segments
            if not isinstance(segment.text, str) or not segment.text.strip()
        ]
        if empty_text_ids:
            error = (
                f"Translated text must not be empty. Empty translations for IDs: {empty_text_ids}. "
                f"You MUST return non-empty translated text for each input segment."
            )
            return False, error, []

        source_mismatch_ids = [
            expected_ids[index]
            for index, (expected_text, returned_text) in enumerate(
                zip(expected_source_texts, response_source_texts, strict=False)
            )
            if expected_text != returned_text
        ]
        if len(response_source_texts) != len(expected_source_texts):
            source_mismatch_ids = expected_ids

        if response_ids == expected_ids and len(resp.segments) == len(segments):
            if source_mismatch_ids:
                error = (
                    "Returned source_text values did not match the input exactly. "
                    f"Mismatched IDs: {source_mismatch_ids}. "
                    "This usually means the response content has shifted across segments."
                )
                return False, error, []
            result = [
                self._map_seg(orig, translated.text)
                for orig, translated in zip(segments, resp.segments, strict=False)
            ]
            return True, "", result

        missing = [segment_id for segment_id in expected_ids if segment_id not in response_ids]
        extra = [segment_id for segment_id in response_ids if segment_id not in expected_ids]
        error = f"Expected {len(segments)} segments but got {len(resp.segments)}."
        if response_ids != expected_ids:
            error += (
                f" Segment IDs/order did not match the input. "
                f"Expected order: {expected_ids}. Received order: {response_ids}."
            )
        if missing:
            error += f" Missing IDs: {missing}."
        if extra:
            error += f" Extra IDs: {extra}."
        if source_mismatch_ids:
            error += f" source_text mismatch IDs: {source_mismatch_ids}."
        error += f" You MUST return exactly {len(segments)} segments with IDs: {expected_ids}."
        return False, error, []

    @staticmethod
    def _map_seg(original: SubtitleSegment, translated_text: str) -> SubtitleSegment:
        new = original.model_copy()
        new.text = translated_text
        return new

    @staticmethod
    def _log_llm_messages(mode_label: str, messages: List[Dict[str, str]]) -> None:
        try:
            logger.debug(
                f"[LLM IO] {mode_label} request messages:\n"
                f"{json.dumps(messages, ensure_ascii=False, indent=2)}"
            )
        except Exception as exc:
            logger.warning(f"[LLM IO] Failed to serialize {mode_label} request messages: {exc}")

    @staticmethod
    def _log_llm_response(mode_label: str, response_model: BaseModel) -> None:
        try:
            logger.debug(
                f"[LLM IO] {mode_label} response payload:\n"
                f"{response_model.model_dump_json(indent=2)}"
            )
        except Exception as exc:
            logger.warning(f"[LLM IO] Failed to serialize {mode_label} response payload: {exc}")

    # --- Single-line fallback ---

    def _translate_single_fallback(
        self, client, model_name: str, segments: List[SubtitleSegment], target_language: str, mode_label: str
    ) -> List[SubtitleSegment]:
        """Translate one segment at a time as last resort."""
        logger.warning(f"[LLM] {mode_label}: falling back to single-line translation for {len(segments)} segments")
        result = []
        for seg in segments:
            try:
                messages = [
                    {
                        "role": "system",
                        "content": (
                            f"Translate the following subtitle line to {target_language}.\n"
                            "Return exactly one segment.\n"
                            "You MUST preserve the original id exactly.\n"
                            "You MUST copy source_text exactly from the input.\n"
                            "Translated text must not be empty.\n"
                            "Do not merge, split, or rewrite surrounding lines."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            [{"id": str(seg.id), "source_text": seg.text}],
                            ensure_ascii=False,
                        ),
                    }
                ]
                self._log_llm_messages(f"{mode_label} single [{seg.id}]", messages)
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=TranslationResponse,
                    messages=messages,
                    temperature=0.3
                )
                self._log_llm_response(f"{mode_label} single [{seg.id}]", resp)
                if (
                    len(resp.segments) == 1
                    and str(resp.segments[0].id) == str(seg.id)
                    and resp.segments[0].source_text == seg.text
                    and isinstance(resp.segments[0].text, str)
                    and resp.segments[0].text.strip()
                ):
                    result.append(self._map_seg(seg, resp.segments[0].text))
                else:
                    logger.warning(f"[LLM] Single-line returned invalid id/count for [{seg.id}], keeping source text")
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
        """Try one structured batch call, then immediately fall back to single-line translation."""
        n = len(segments)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_json_str},
        ]
        self._log_llm_messages(mode_label, messages)
        try:
            resp = client.chat.completions.create(
                model=model_name,
                response_model=TranslationResponse,
                messages=messages,
                temperature=0.3
            )
        except Exception as e:
            logger.warning(
                f"[LLM] {mode_label}: batch request failed, falling back to single-line for all {n} segments: {e}"
            )
            return self._translate_single_fallback(client, model_name, segments, target_language, mode_label)

        self._log_llm_response(mode_label, resp)
        logger.info(f"[LLM IO] {mode_label}: input {n}, output {len(resp.segments)}")

        is_valid, error_msg, mapped = self._validate_response(resp, segments)
        if is_valid:
            return mapped

        logger.warning(f"[LLM] {mode_label}: validation failed, falling back to single-line: {error_msg}")
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

        subtitle_rows = [
            {"id": str(s.id), "source_text": s.text}
            for s in segments
        ]
        subtitle_dict = {row["id"]: row["source_text"] for row in subtitle_rows}
        n = len(segments)

        # --- Cache check ---
        if mode in ("standard", "proofread"):
            cached = self._cache.get(subtitle_dict, model_name, target_language, mode)
            if cached:
                return [self._map_seg(seg, cached.get(str(seg.id), seg.text)) for seg in segments]

        # --- Build user content with optional context ---
        if context_before and mode != "intelligent":
            context_lines = [
                {"id": str(s.id), "source_text": s.text}
                for s in context_before
            ]
            user_content = (
                f"[CONTEXT — previous lines for reference only, do NOT translate these]\n"
                f"{json.dumps(context_lines, ensure_ascii=False)}\n\n"
                f"[TRANSLATE — translate these {n} entries]\n"
                f"{json.dumps(subtitle_rows, ensure_ascii=False)}"
            )
        else:
            user_content = json.dumps(subtitle_rows, ensure_ascii=False)

        # --- Glossary ---
        relevant_terms = self._glossary_service.get_relevant_terms(
            " ".join(subtitle_dict.values())
        )

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
1. Input is a JSON array with {n} entries. You MUST output exactly {n} segments.
2. Preserve the exact 'id' from input — do NOT renumber.
3. Copy 'source_text' exactly from input into output. Do not edit it.
4. Translate ONLY the text field. Never merge or split lines, even if incomplete.
5. Every translated 'text' must be non-empty.
6. Fragments stay as fragments.
7. NEVER pull meaning from the next or previous segment into the current segment.
8. If two neighboring lines read better as one sentence, you MUST still keep them separate.
9. Do not complete a sentence using words that belong to another segment.
{ctx_note}
Example:
Input: [{{"id":"1","source_text":"Hello everyone"}}, {{"id":"2","source_text":"welcome to"}}, {{"id":"3","source_text":"our channel"}}]
Correct output has 3 segments with unchanged source_text values.
Wrong: any reordered, merged, empty, or source_text-edited output.
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
4. Copy 'source_text' exactly from input into output. Do not edit it.
5. Output 'text' must be non-empty.
6. Do NOT translate. Keep the original language.
7. NEVER merge semantic content from neighboring segments into the current one.
8. If a line is incomplete, keep it incomplete instead of borrowing completion from the next line.
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
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ]
            self._log_llm_messages("Intelligent", messages)
            resp = client.chat.completions.create(
                model=model_name,
                response_model=IntelligentTranslationResponse,
                messages=messages,
                temperature=0.7
            )

            self._log_llm_response("Intelligent", resp)
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
            except Exception as e:
                raise RuntimeError(
                    "Translation failed before single-line fallback could complete. "
                    f"Batch {batch_num}/{total_batches}. Last error: {e}"
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

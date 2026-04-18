
import json
import hashlib
import time
import threading
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass
from typing import Any, Callable, List, Dict, Optional, Literal, Type
from pydantic import BaseModel, Field
from json_repair import repair_json
from loguru import logger
from backend.models.schemas import SubtitleSegment
from backend.config import settings
from backend.services.translator.text_normalizer import normalize_text_for_target_language

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
CACHE_SCHEMA_VERSION = 2
CONTEXT_OVERLAP = 3  # Number of lines from previous batch to include as context
DEFAULT_TRANSLATION_MAX_CONCURRENCY = 3

class TranslationCache:
    """Disk-based translation cache keyed by content hash + model + language."""

    def __init__(self):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key(texts: Dict[str, str], model: str, language: str, mode: str) -> str:
        """Stable hash from segment texts + model + language + mode."""
        payload = json.dumps(texts, sort_keys=True, ensure_ascii=False)
        raw = f"v{CACHE_SCHEMA_VERSION}|{payload}|{model}|{language}|{mode}"
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

@dataclass
class TranslationOutcome:
    segments: List[SubtitleSegment]
    cacheable: bool


@dataclass(frozen=True)
class TranslationBatch:
    index: int
    segments: List[SubtitleSegment]
    context_before: Optional[List[SubtitleSegment]]

class LLMTranslator:
    def __init__(self, *, settings_manager, glossary_service):
        self._cache = TranslationCache()
        self.model = settings.LLM_MODEL
        self._settings_manager = settings_manager
        self._glossary_service = glossary_service

    @staticmethod
    def _normalize_batch_size(batch_size: int) -> int:
        return max(1, int(batch_size))

    @staticmethod
    def _resolve_max_concurrency(
        total_batches: int,
        requested: Optional[int],
    ) -> int:
        if total_batches <= 1:
            return 1

        limit = requested
        if limit is None:
            limit = getattr(
                settings,
                "LLM_TRANSLATION_MAX_CONCURRENCY",
                DEFAULT_TRANSLATION_MAX_CONCURRENCY,
            )

        try:
            normalized = int(limit)
        except (TypeError, ValueError):
            normalized = 1

        return max(1, min(total_batches, normalized))

    @staticmethod
    def _build_translation_batches(
        segments: List[SubtitleSegment],
        batch_size: int,
        mode: str,
    ) -> List[TranslationBatch]:
        normalized_batch_size = max(1, int(batch_size))
        batches: List[TranslationBatch] = []

        for index, start in enumerate(range(0, len(segments), normalized_batch_size), start=1):
            batch_segments = segments[start:start + normalized_batch_size]
            context_before: Optional[List[SubtitleSegment]] = None
            if mode != "intelligent" and start > 0:
                context_start = max(0, start - CONTEXT_OVERLAP)
                context_before = segments[context_start:start]
            batches.append(
                TranslationBatch(
                    index=index,
                    segments=batch_segments,
                    context_before=context_before,
                )
            )

        return batches

    def _translate_planned_batch(
        self,
        batch: TranslationBatch,
        target_language: str,
        mode: str,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> List[SubtitleSegment]:
        self._checkpoint(cancel_check)
        return self._translate_batch_struct(
            batch.segments,
            target_language,
            mode,
            context_before=batch.context_before,
            cancel_check=cancel_check,
        )

    @staticmethod
    def _checkpoint(cancel_check: Optional[Callable[[], None]]) -> None:
        if cancel_check is not None:
            cancel_check()

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
        self,
        resp: TranslationResponse,
        segments: List[SubtitleSegment],
        target_language: str,
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
                self._map_seg(
                    orig,
                    translated.text,
                    target_language=target_language,
                    source_text=translated.source_text,
                )
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
    def _map_seg(
        original: SubtitleSegment,
        translated_text: str,
        *,
        target_language: Optional[str] = None,
        source_text: Optional[str] = None,
    ) -> SubtitleSegment:
        new = original.model_copy()
        new.text = normalize_text_for_target_language(
            translated_text,
            target_language=target_language,
            source_text=source_text or original.text,
        )
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

    @staticmethod
    def _build_output_style_rules() -> str:
        return (
            "Output style requirements:\n"
            "- Follow the normal writing and punctuation conventions of the output language.\n"
            "- If the output text is Chinese, do not casually use the em dash '——'. "
            "Prefer commas, periods, colons, or semicolons unless the source clearly requires a strong interruption or abrupt break.\n"
            "- If the output text is Chinese, follow standard Chinese typography: use full-width Chinese punctuation, "
            "and insert spaces between Chinese text and standalone English words, abbreviations, or acronyms."
        )

    @staticmethod
    def _strip_code_fence(payload: str) -> str:
        stripped = payload.strip()
        if stripped.startswith("```") and stripped.endswith("```"):
            lines = stripped.splitlines()
            if len(lines) >= 2:
                return "\n".join(lines[1:-1]).strip()
        return stripped

    @staticmethod
    def _iter_completion_payloads(completion: Any) -> List[str]:
        payloads: List[str] = []
        choices = getattr(completion, "choices", None) or []
        for choice in choices:
            message = getattr(choice, "message", None)
            if message is None:
                continue

            tool_calls = getattr(message, "tool_calls", None) or []
            for tool_call in tool_calls:
                function = getattr(tool_call, "function", None)
                arguments = getattr(function, "arguments", None)
                if isinstance(arguments, str) and arguments.strip():
                    payloads.append(arguments)

            content = getattr(message, "content", None)
            if isinstance(content, str) and content.strip():
                payloads.append(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        text = part.get("text")
                    else:
                        text = getattr(part, "text", None)
                    if isinstance(text, str) and text.strip():
                        payloads.append(text)
        return payloads

    def _parse_structured_response_payload(
        self,
        payload: str,
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        normalized = self._strip_code_fence(payload)
        if not normalized:
            return None

        try:
            return response_model.model_validate_json(normalized)
        except Exception as parse_error:
            try:
                repaired = repair_json(normalized, return_objects=True)
                return response_model.model_validate(repaired)
            except Exception as repair_error:
                logger.debug(
                    f"[LLM] {mode_label}: failed to recover structured payload. "
                    f"parse_error={parse_error}; repair_error={repair_error}"
                )
                return None

    def _recover_structured_response_from_exception(
        self,
        error: Exception,
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        failed_attempts = getattr(error, "failed_attempts", None) or []
        for attempt in reversed(failed_attempts):
            for payload in self._iter_completion_payloads(attempt.completion):
                recovered = self._parse_structured_response_payload(
                    payload,
                    response_model,
                    mode_label,
                )
                if recovered:
                    logger.warning(
                        f"[LLM] {mode_label}: recovered structured response from failed completion payload"
                    )
                    return recovered
        return None

    def _request_raw_structured_response(
        self,
        client,
        model_name: str,
        messages: List[Dict[str, str]],
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.3,
            )
        except Exception as error:
            recovered = self._recover_structured_response_from_exception(
                error,
                response_model,
                f"{mode_label} raw retry",
            )
            if recovered:
                return recovered
            logger.warning(
                f"[LLM] {mode_label}: raw retry failed before recovery: {error}"
            )
            return None

        for payload in self._iter_completion_payloads(completion):
            recovered = self._parse_structured_response_payload(
                payload,
                response_model,
                f"{mode_label} raw retry",
            )
            if recovered:
                logger.warning(
                    f"[LLM] {mode_label}: recovered structured response from raw retry payload"
                )
                return recovered
        return None

    def _extract_plain_text_from_payload(self, payload: str) -> Optional[str]:
        normalized = self._strip_code_fence(payload)
        if not normalized:
            return None

        try:
            parsed = repair_json(normalized, return_objects=True)
        except Exception:
            parsed = None

        if isinstance(parsed, dict):
            text = parsed.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

            segments = parsed.get("segments")
            if (
                isinstance(segments, list)
                and len(segments) == 1
                and isinstance(segments[0], dict)
            ):
                segment_text = segments[0].get("text")
                if isinstance(segment_text, str) and segment_text.strip():
                    return segment_text.strip()

        if isinstance(parsed, list) and len(parsed) == 1:
            only_item = parsed[0]
            if isinstance(only_item, str) and only_item.strip():
                return only_item.strip()
            if isinstance(only_item, dict):
                segment_text = only_item.get("text")
                if isinstance(segment_text, str) and segment_text.strip():
                    return segment_text.strip()

        if isinstance(parsed, str) and parsed.strip():
            return parsed.strip()

        return normalized.strip() or None

    def _extract_plain_text_from_completion(self, completion: Any) -> Optional[str]:
        for payload in self._iter_completion_payloads(completion):
            extracted = self._extract_plain_text_from_payload(payload)
            if extracted:
                return extracted
        return None

    def _build_single_line_messages(
        self,
        seg: SubtitleSegment,
        target_language: str,
        mode_label: str,
    ) -> List[Dict[str, str]]:
        if mode_label == "Proofread":
            system_content = (
                "Proofread the following subtitle line.\n"
                "Return only the corrected subtitle text as plain text.\n"
                "Do not return JSON, markdown, labels, or explanations.\n"
                "Keep the original language.\n"
                "Do not merge, split, or rewrite surrounding lines.\n"
                f"{self._build_output_style_rules()}"
            )
        else:
            system_content = (
                f"Translate the following subtitle line to {target_language}.\n"
                "Return only the translated subtitle text as plain text.\n"
                "Do not return JSON, markdown, labels, or explanations.\n"
                "Do not merge, split, or rewrite surrounding lines.\n"
                f"{self._build_output_style_rules()}"
            )

        return [
            {"role": "system", "content": system_content},
            {"role": "user", "content": seg.text},
        ]

    # --- Single-line fallback ---

    def _translate_single_fallback(
        self,
        client,
        model_name: str,
        segments: List[SubtitleSegment],
        target_language: str,
        mode_label: str,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> TranslationOutcome:
        """Translate one segment at a time as last resort."""
        logger.warning(f"[LLM] {mode_label}: falling back to single-line translation for {len(segments)} segments")
        result = []
        cacheable = True
        for seg in segments:
            self._checkpoint(cancel_check)
            try:
                messages = self._build_single_line_messages(seg, target_language, mode_label)
                self._log_llm_messages(f"{mode_label} single [{seg.id}]", messages)
                completion = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.3
                )
                translated_text = self._extract_plain_text_from_completion(completion)
                if translated_text:
                    result.append(
                        self._map_seg(
                            seg,
                            translated_text,
                            target_language=target_language,
                        )
                    )
                else:
                    logger.warning(f"[LLM] Single-line returned empty text for [{seg.id}], keeping source text")
                    cacheable = False
                    result.append(seg)
            except Exception as e:
                logger.warning(f"[LLM] Single-line failed for [{seg.id}]: {e}")
                cacheable = False
                result.append(seg)
        return TranslationOutcome(segments=result, cacheable=cacheable)

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
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> TranslationOutcome:
        """Try one structured batch call, then immediately fall back to single-line translation."""
        n = len(segments)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_json_str},
        ]
        self._log_llm_messages(mode_label, messages)
        self._checkpoint(cancel_check)
        try:
            resp = client.chat.completions.create(
                model=model_name,
                response_model=TranslationResponse,
                messages=messages,
                temperature=0.3
            )
        except Exception as e:
            recovered = self._recover_structured_response_from_exception(
                e,
                TranslationResponse,
                mode_label,
            )
            if recovered is None:
                recovered = self._request_raw_structured_response(
                    client,
                    model_name,
                    messages,
                    TranslationResponse,
                    mode_label,
                )
            if recovered is None:
                logger.warning(
                    f"[LLM] {mode_label}: batch request failed, falling back to single-line for all {n} segments: {e}"
                )
                return self._translate_single_fallback(
                    client,
                    model_name,
                    segments,
                    target_language,
                    mode_label,
                    cancel_check=cancel_check,
                )
            logger.warning(
                f"[LLM] {mode_label}: recovered batch response after structured parse failure"
            )
            resp = recovered

        self._log_llm_response(mode_label, resp)
        logger.info(f"[LLM IO] {mode_label}: input {n}, output {len(resp.segments)}")

        is_valid, error_msg, mapped = self._validate_response(resp, segments, target_language)
        if is_valid:
            return TranslationOutcome(segments=mapped, cacheable=True)

        logger.warning(f"[LLM] {mode_label}: validation failed, falling back to single-line: {error_msg}")
        return self._translate_single_fallback(
            client,
            model_name,
            segments,
            target_language,
            mode_label,
            cancel_check=cancel_check,
        )

    # --- Mode dispatching ---

    def _translate_batch_struct(
        self,
        segments: List[SubtitleSegment],
        target_language: str,
        mode: Literal["standard", "proofread", "intelligent"],
        context_before: Optional[List[SubtitleSegment]] = None,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> List[SubtitleSegment]:
        """Internal batch translation using structured output."""
        self._checkpoint(cancel_check)
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
                normalized_cached = {
                    str(seg.id): self._map_seg(
                        seg,
                        cached.get(str(seg.id), seg.text),
                        target_language=target_language,
                    ).text
                    for seg in segments
                }
                if normalized_cached != cached:
                    self._cache.put(subtitle_dict, model_name, target_language, mode, normalized_cached)
                return [
                    self._map_seg(
                        seg,
                        normalized_cached.get(str(seg.id), seg.text),
                        target_language=target_language,
                    )
                    for seg in segments
                ]

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
        system_prompt += f"\n{self._build_output_style_rules()}"

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
            outcome = self._translate_with_correction(
                client,
                model_name,
                system_prompt,
                segments,
                user_content,
                target_language,
                "Standard",
                cancel_check=cancel_check,
            )
            self._checkpoint(cancel_check)
            if outcome.cacheable:
                self._cache.put(
                    subtitle_dict,
                    model_name,
                    target_language,
                    mode,
                    {str(s.id): s.text for s in outcome.segments},
                )
            return outcome.segments

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
            outcome = self._translate_with_correction(
                client,
                model_name,
                system_prompt,
                segments,
                user_content,
                target_language,
                "Proofread",
                cancel_check=cancel_check,
            )
            self._checkpoint(cancel_check)
            if outcome.cacheable:
                self._cache.put(
                    subtitle_dict,
                    model_name,
                    target_language,
                    mode,
                    {str(s.id): s.text for s in outcome.segments},
                )
            return outcome.segments

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
            self._checkpoint(cancel_check)
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=IntelligentTranslationResponse,
                    messages=messages,
                    temperature=0.7
                )
            except Exception as e:
                recovered = self._recover_structured_response_from_exception(
                    e,
                    IntelligentTranslationResponse,
                    "Intelligent",
                )
                if recovered is None:
                    recovered = self._request_raw_structured_response(
                        client,
                        model_name,
                        messages,
                        IntelligentTranslationResponse,
                        "Intelligent",
                    )
                if recovered is None:
                    raise
                logger.warning(
                    "[LLM] Intelligent: recovered batch response after structured parse failure"
                )
                resp = recovered

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
                self._checkpoint(cancel_check)
                duration = (seg.time_percentage / total_pct) * total_duration
                seg_start = current_time
                seg_end = current_time + duration
                if i == len(resp.segments) - 1:
                    seg_end = total_end
                new_segments.append(SubtitleSegment(
                    id=str(start_id + i),
                    text=normalize_text_for_target_language(
                        seg.text,
                        target_language=target_language,
                        source_text=None,
                    ),
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
        progress_callback=None,
        max_concurrency: Optional[int] = None,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> List[SubtitleSegment]:
        """Orchestrates batch translation with planned context and bounded parallelism."""
        if not segments:
            logger.warning("[Translate] Received empty segments list.")
            return []

        # Periodic cache cleanup
        self._cache.cleanup()
        self._checkpoint(cancel_check)

        effective_mode = mode if mode in ["standard", "intelligent", "proofread"] else "standard"
        normalized_batch_size = self._normalize_batch_size(batch_size)
        batches = self._build_translation_batches(segments, normalized_batch_size, effective_mode)
        total_batches = len(batches)
        resolved_max_concurrency = self._resolve_max_concurrency(total_batches, max_concurrency)
        translated_batches: List[Optional[List[SubtitleSegment]]] = [None] * total_batches

        logger.info(
            f"Starting translation: {len(segments)} segments, mode={effective_mode}, "
            f"batch_size={normalized_batch_size}, batches={total_batches}, "
            f"max_concurrency={resolved_max_concurrency}"
        )

        completed_batches = 0
        progress_lock = threading.Lock()

        def notify_progress(message: str) -> None:
            if not progress_callback:
                return
            with progress_lock:
                self._checkpoint(cancel_check)
                progress_callback(
                    int((completed_batches / total_batches) * 100),
                    message,
                )

        notify_progress(
            f"Translating 0/{total_batches} batches ({effective_mode}, concurrency={resolved_max_concurrency})..."
        )

        def store_batch_result(batch: TranslationBatch, result: List[SubtitleSegment]) -> None:
            nonlocal completed_batches
            translated_batches[batch.index - 1] = result
            with progress_lock:
                self._checkpoint(cancel_check)
                completed_batches += 1
                if progress_callback:
                    progress_callback(
                        int((completed_batches / total_batches) * 100),
                        f"Translated {completed_batches}/{total_batches} batches ({effective_mode})..."
                    )

        if resolved_max_concurrency == 1:
            for batch in batches:
                self._checkpoint(cancel_check)
                try:
                    result = self._translate_planned_batch(
                        batch,
                        target_language,
                        effective_mode,
                        cancel_check=cancel_check,
                    )
                except Exception as e:
                    raise RuntimeError(
                        "Translation failed before single-line fallback could complete. "
                        f"Batch {batch.index}/{total_batches}. Last error: {e}"
                    ) from e
                store_batch_result(batch, result)
        else:
            executor = ThreadPoolExecutor(max_workers=resolved_max_concurrency)
            batch_iter = iter(batches)
            pending: dict[Any, TranslationBatch] = {}
            fast_abort = False

            def submit_next_batch() -> bool:
                self._checkpoint(cancel_check)
                try:
                    next_batch = next(batch_iter)
                except StopIteration:
                    return False

                future = executor.submit(
                    self._translate_planned_batch,
                    next_batch,
                    target_language,
                    effective_mode,
                    cancel_check,
                )
                pending[future] = next_batch
                return True

            try:
                while len(pending) < resolved_max_concurrency and submit_next_batch():
                    pass

                while pending:
                    self._checkpoint(cancel_check)
                    done, _ = wait(
                        tuple(pending.keys()),
                        timeout=0.05,
                        return_when=FIRST_COMPLETED,
                    )
                    if not done:
                        continue

                    for future in done:
                        batch = pending.pop(future)
                        try:
                            result = future.result()
                        except Exception as e:
                            fast_abort = True
                            for pending_future in pending:
                                pending_future.cancel()
                            raise RuntimeError(
                                "Translation failed before single-line fallback could complete. "
                                f"Batch {batch.index}/{total_batches}. Last error: {e}"
                            ) from e

                        store_batch_result(batch, result)

                        while len(pending) < resolved_max_concurrency and submit_next_batch():
                            pass
            except Exception:
                fast_abort = True
                raise
            finally:
                executor.shutdown(wait=not fast_abort, cancel_futures=True)

        translated_segments = [
            segment
            for batch_result in translated_batches
            if batch_result is not None
            for segment in batch_result
        ]

        # Re-index IDs for intelligent mode
        if effective_mode == "intelligent":
            for i, seg in enumerate(translated_segments):
                seg.id = str(i + 1)

        logger.info(f"[Translate] Done. Total segments: {len(translated_segments)}")

        if progress_callback:
            progress_callback(100, "Translation completed")

        return translated_segments

import json
from typing import Callable, Dict, List, Literal, Optional

from loguru import logger
from pydantic import BaseModel

from backend.config import settings
from backend.models.schemas import SubtitleSegment
from backend.services.translator.text_normalizer import normalize_text_for_target_language
from backend.services.translator.translation_cache import TranslationCache
from backend.services.translator.translation_client import TranslationClientFactory
from backend.services.translator.translation_batch_runner import (
    build_translation_batches,
    checkpoint,
    normalize_batch_size,
    resolve_max_concurrency,
    run_translation_batches,
)
from backend.services.translator.translation_models import (
    IntelligentTranslationResponse,
    TranslationBatch,
    TranslationOutcome,
    TranslationResponse,
)
from backend.services.translator.translation_prompts import TranslationPromptBuilder
from backend.services.translator.translation_response_parser import TranslationResponseParser
from backend.services.translator.translation_validator import TranslationResponseValidator


class LLMTranslator:
    def __init__(self, *, settings_manager, glossary_service):
        self._cache = TranslationCache()
        self.model = settings.LLM_MODEL
        self._glossary_service = glossary_service
        self._client_factory = TranslationClientFactory(settings_manager)
        self._prompt_builder = TranslationPromptBuilder()
        self._response_parser = TranslationResponseParser()
        self._response_validator = TranslationResponseValidator()

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
        checkpoint(cancel_check)

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

    def _translate_single_fallback(
        self,
        client,
        model_name: str,
        segments: List[SubtitleSegment],
        target_language: str,
        mode_label: str,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> TranslationOutcome:
        logger.warning(f"[LLM] {mode_label}: falling back to single-line translation for {len(segments)} segments")
        result = []
        cacheable = True
        for segment in segments:
            self._checkpoint(cancel_check)
            try:
                messages = self._prompt_builder.build_single_line_messages(
                    segment,
                    target_language,
                    mode_label,
                )
                self._log_llm_messages(f"{mode_label} single [{segment.id}]", messages)
                completion = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.3,
                )
                translated_text = self._response_parser.extract_plain_text_from_completion(completion)
                if translated_text:
                    result.append(
                        self._response_validator.map_segment(
                            segment,
                            translated_text,
                            target_language=target_language,
                        )
                    )
                else:
                    logger.warning(f"[LLM] Single-line returned empty text for [{segment.id}], keeping source text")
                    cacheable = False
                    result.append(segment)
            except Exception as exc:
                logger.warning(f"[LLM] Single-line failed for [{segment.id}]: {exc}")
                cacheable = False
                result.append(segment)
        return TranslationOutcome(segments=result, cacheable=cacheable)

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
        segment_count = len(segments)
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
                temperature=0.3,
            )
        except Exception as exc:
            recovered = self._response_parser.recover_structured_response_from_exception(
                exc,
                TranslationResponse,
                mode_label,
            )
            if recovered is None:
                recovered = self._response_parser.request_raw_structured_response(
                    client,
                    model_name,
                    messages,
                    TranslationResponse,
                    mode_label,
                )
            if recovered is None:
                logger.warning(
                    f"[LLM] {mode_label}: batch request failed, falling back to single-line for all {segment_count} segments: {exc}"
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
        logger.info(f"[LLM IO] {mode_label}: input {segment_count}, output {len(resp.segments)}")

        is_valid, error_msg, mapped = self._response_validator.validate(resp, segments, target_language)
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

    def _translate_batch_struct(
        self,
        segments: List[SubtitleSegment],
        target_language: str,
        mode: Literal["standard", "proofread", "intelligent"],
        context_before: Optional[List[SubtitleSegment]] = None,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> List[SubtitleSegment]:
        self._checkpoint(cancel_check)
        client, model_name = self._client_factory.get_client()
        if not client:
            raise ValueError("LLM Client not initialized (Check Settings)")

        subtitle_rows = [{"id": str(segment.id), "source_text": segment.text} for segment in segments]
        subtitle_dict = {row["id"]: row["source_text"] for row in subtitle_rows}
        segment_count = len(segments)

        if mode in ("standard", "proofread"):
            cached = self._cache.get(subtitle_dict, model_name, target_language, mode)
            if cached:
                normalized_cached = {
                    str(segment.id): self._response_validator.map_segment(
                        segment,
                        cached.get(str(segment.id), segment.text),
                        target_language=target_language,
                    ).text
                    for segment in segments
                }
                if normalized_cached != cached:
                    self._cache.put(subtitle_dict, model_name, target_language, mode, normalized_cached)
                return [
                    self._response_validator.map_segment(
                        segment,
                        normalized_cached.get(str(segment.id), segment.text),
                        target_language=target_language,
                    )
                    for segment in segments
                ]

        user_content = self._prompt_builder.build_user_content(
            subtitle_rows,
            mode,
            context_before,
        )
        relevant_terms = self._glossary_service.get_relevant_terms(" ".join(subtitle_dict.values()))
        base_system_prompt = self._prompt_builder.build_base_system_prompt(
            target_language,
            relevant_terms,
        )

        if mode == "standard":
            system_prompt = self._prompt_builder.build_standard_system_prompt(
                base_system_prompt,
                segment_count,
                bool(context_before),
            )
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
                    {str(segment.id): segment.text for segment in outcome.segments},
                )
            return outcome.segments

        if mode == "proofread":
            system_prompt = self._prompt_builder.build_proofread_system_prompt(
                base_system_prompt,
                segment_count,
                bool(context_before),
            )
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
                    {str(segment.id): segment.text for segment in outcome.segments},
                )
            return outcome.segments

        if mode == "intelligent":
            system_prompt = self._prompt_builder.build_intelligent_system_prompt(
                base_system_prompt,
                target_language,
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]
            self._log_llm_messages("Intelligent", messages)
            self._checkpoint(cancel_check)
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=IntelligentTranslationResponse,
                    messages=messages,
                    temperature=0.7,
                )
            except Exception as exc:
                recovered = self._response_parser.recover_structured_response_from_exception(
                    exc,
                    IntelligentTranslationResponse,
                    "Intelligent",
                )
                if recovered is None:
                    recovered = self._response_parser.request_raw_structured_response(
                        client,
                        model_name,
                        messages,
                        IntelligentTranslationResponse,
                        "Intelligent",
                    )
                if recovered is None:
                    raise
                logger.warning("[LLM] Intelligent: recovered batch response after structured parse failure")
                resp = recovered

            self._log_llm_response("Intelligent", resp)
            logger.info(f"[LLM IO] Intelligent: input {len(segments)} -> output {len(resp.segments)}")

            total_start = segments[0].start
            total_end = segments[-1].end
            total_duration = total_end - total_start
            total_pct = sum(segment.time_percentage for segment in resp.segments) or 1.0
            start_id = int(segments[0].id) if str(segments[0].id).isdigit() else 0

            new_segments = []
            current_time = total_start
            for index, segment in enumerate(resp.segments):
                self._checkpoint(cancel_check)
                duration = (segment.time_percentage / total_pct) * total_duration
                segment_start = current_time
                segment_end = current_time + duration
                if index == len(resp.segments) - 1:
                    segment_end = total_end
                new_segments.append(
                    SubtitleSegment(
                        id=str(start_id + index),
                        text=normalize_text_for_target_language(
                            segment.text,
                            target_language=target_language,
                            source_text=None,
                        ),
                        start=round(segment_start, 3),
                        end=round(segment_end, 3),
                    )
                )
                current_time = segment_end
            return new_segments

        return segments

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
        if not segments:
            logger.warning("[Translate] Received empty segments list.")
            return []

        self._cache.cleanup()
        self._checkpoint(cancel_check)

        effective_mode = mode if mode in ["standard", "intelligent", "proofread"] else "standard"
        normalized_batch_size = normalize_batch_size(batch_size)
        batches = build_translation_batches(segments, normalized_batch_size, effective_mode)
        total_batches = len(batches)
        resolved_max_concurrency = resolve_max_concurrency(total_batches, max_concurrency)

        logger.info(
            f"Starting translation: {len(segments)} segments, mode={effective_mode}, "
            f"batch_size={normalized_batch_size}, batches={total_batches}, "
            f"max_concurrency={resolved_max_concurrency}"
        )

        translated_segments = run_translation_batches(
            batches=batches,
            target_language=target_language,
            mode=effective_mode,
            max_concurrency=resolved_max_concurrency,
            translate_batch=self._translate_planned_batch,
            progress_callback=progress_callback,
            cancel_check=cancel_check,
        )

        if effective_mode == "intelligent":
            for index, segment in enumerate(translated_segments):
                segment.id = str(index + 1)

        logger.info(f"[Translate] Done. Total segments: {len(translated_segments)}")

        if progress_callback:
            progress_callback(100, "Translation completed")

        return translated_segments

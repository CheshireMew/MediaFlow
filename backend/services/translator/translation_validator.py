from typing import List, Optional

from backend.models.schemas import SubtitleSegment
from backend.services.translator.text_normalizer import normalize_text_for_target_language
from backend.services.translator.translation_models import TranslationResponse


class TranslationResponseValidator:
    def validate(
        self,
        resp: TranslationResponse,
        segments: List[SubtitleSegment],
        target_language: str,
    ) -> tuple[bool, str, List[SubtitleSegment]]:
        expected_ids = [str(segment.id) for segment in segments]
        expected_source_texts = [segment.text for segment in segments]
        response_ids = [str(segment.id) for segment in resp.segments]
        response_source_texts = [segment.source_text for segment in resp.segments]
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
                self.map_segment(
                    original,
                    translated.text,
                    target_language=target_language,
                    source_text=translated.source_text,
                )
                for original, translated in zip(segments, resp.segments, strict=False)
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
    def map_segment(
        original: SubtitleSegment,
        translated_text: str,
        *,
        target_language: Optional[str] = None,
        source_text: Optional[str] = None,
    ) -> SubtitleSegment:
        new_segment = original.model_copy()
        new_segment.text = normalize_text_for_target_language(
            translated_text,
            target_language=target_language,
            source_text=source_text or original.text,
        )
        return new_segment

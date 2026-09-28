from typing import Any

from loguru import logger

from backend.core.asr_execution import is_out_of_memory
from backend.models.subtitle_contracts import SubtitleSegment
from backend.utils.segment_refiner import SegmentRefiner


class CoreStrategies:
    def transcribe_direct(
        self, audio_path: str, duration: float, model: Any,
        language: str | None, initial_prompt: str | None,
        vad_filter: bool, progress_callback,
    ) -> list[SubtitleSegment]:
        logger.info("Sequential ASR: duration={:.2f}s vad={}", duration, vad_filter)
        if progress_callback:
            progress_callback(20, "transcription_starting", {})
        segments, _ = model.transcribe(
            audio_path,
            beam_size=5,
            language=language if language != "auto" else None,
            vad_filter=vad_filter,
            initial_prompt=initial_prompt,
            word_timestamps=True,
            condition_on_previous_text=False,
        )
        return self._collect(segments, duration, progress_callback)

    def transcribe_smart_split(
        self, audio_path: str, duration: float, model: Any,
        language: str | None, initial_prompt: str | None,
        vad_filter: bool, progress_callback, *, batch_size: int = 4,
    ) -> list[SubtitleSegment]:
        # Use the engine's speech segmentation and timestamp restoration. This
        # avoids arbitrary ten-minute cuts and out-of-order thread completion.
        # A batch executes multiple speech chunks with a single model allocation.
        if not vad_filter:
            logger.info("ASR batching disabled because speech segmentation was explicitly disabled")
            return self.transcribe_direct(
                audio_path, duration, model, language, initial_prompt,
                vad_filter, progress_callback,
            )
        from faster_whisper import BatchedInferencePipeline

        while True:
            logger.info("Long audio ASR: speech chunks <=30s, batch_size={}", batch_size)
            if progress_callback:
                progress_callback(10, "asr_audio_splitting", {})
            try:
                pipeline = BatchedInferencePipeline(model=model)
                segments, _ = pipeline.transcribe(
                    audio_path,
                    batch_size=batch_size,
                    beam_size=5,
                    language=language if language != "auto" else None,
                    vad_filter=True,
                    initial_prompt=initial_prompt,
                    word_timestamps=True,
                    chunk_length=30,
                )
                return self._collect(segments, duration, progress_callback)
            except RuntimeError as error:
                if not is_out_of_memory(error) or batch_size <= 1:
                    raise
                batch_size = max(1, batch_size // 2)
                logger.warning("ASR memory exhausted; retrying batch_size={} with unchanged precision", batch_size)

    @staticmethod
    def _collect(segments, duration, progress_callback) -> list[SubtitleSegment]:
        collected = []
        try:
            for segment in segments:
                if progress_callback:
                    percent = min(100, int(segment.end / duration * 100)) if duration > 0 else 0
                    progress_callback(20 + percent * 0.7, "transcription_progress", {"percent": percent})
                collected.append(segment)
        finally:
            close = getattr(segments, "close", None)
            if close:
                close()
        collected.sort(key=lambda segment: (segment.start, segment.end))
        return SegmentRefiner.refine_segments(collected)

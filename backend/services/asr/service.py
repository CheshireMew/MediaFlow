from __future__ import annotations

import os
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor

from loguru import logger

from backend.config import settings
from backend.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig
from backend.core.task_control import TaskControlRequested
from backend.models.media_contracts import TaskArtifact, TaskResult
from backend.models.task_result_contracts import PipelineOutputs, TranscriptionOutput
from backend.models.transcription_contracts import (
    DEFAULT_ASR_VAD_FILTER,
    TranscriptionEngine,
)
from backend.services.media_refs import create_media_ref
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner
from backend.utils.subtitle_writer import SubtitleWriter

from .cli_prewarm import CliPrewarmManager
from .core_strategies import CoreStrategies
from .engine_executor import ASREngineExecutor
from .model_manager import ModelManager
from .workspace import create_segment_audio_path, create_transcription_work_dir


class ASRService:
    def __init__(
        self,
        *,
        model_manager=None,
        adapter=None,
        core_strategies=None,
        prewarm_manager=None,
        engine_executor=None,
    ):
        model_manager = model_manager or ModelManager()
        adapter = adapter or FasterWhisperAdapter()
        if core_strategies is None:
            core_strategies = CoreStrategies(
                ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
            )
        self._model_manager = model_manager
        self._prewarm = prewarm_manager or CliPrewarmManager(
            model_manager=model_manager,
            adapter=adapter,
        )
        self._engines = engine_executor or ASREngineExecutor(
            model_manager=model_manager,
            adapter=adapter,
            core_strategies=core_strategies,
        )

    def start_cli_prewarm(self, model_name: str = "base", device: str = "cpu") -> bool:
        return self._prewarm.start(model_name=model_name, device=device)

    def transcribe(
        self,
        *,
        audio_path: str,
        model_name: str = "base",
        device: str = "cpu",
        engine: TranscriptionEngine = "builtin",
        language: str | None = None,
        vad_filter: bool = DEFAULT_ASR_VAD_FILTER,
        task_id: str | None = None,
        initial_prompt: str | None = None,
        progress_callback=None,
    ) -> TaskResult:
        if not os.path.exists(audio_path):
            logger.error("Audio file not found: {}", audio_path)
            return TaskResult(success=False, error=f"File not found: {audio_path}")

        duration = self._audio_duration(audio_path)
        use_cli = engine == "cli"
        if use_cli and self._prewarm.available_cli_path() is None:
            return TaskResult(success=False, error="CLI transcription engine is unavailable")

        work_dir = create_transcription_work_dir(task_id)
        try:
            prepared_audio_path = AudioProcessor.prepare_for_transcription(
                audio_path,
                work_dir / "input.flac",
            )
        except Exception as error:
            shutil.rmtree(work_dir, ignore_errors=True)
            logger.error("Failed to prepare ASR audio input: {}", error)
            return TaskResult(
                success=False,
                error=f"Failed to prepare audio for transcription: {error}",
            )

        try:
            if use_cli:
                segments = self._transcribe_cli(
                    audio_path=prepared_audio_path,
                    work_dir=work_dir,
                    model_name=model_name,
                    device=device,
                    language=language,
                    initial_prompt=initial_prompt,
                    vad_filter=vad_filter,
                    progress_callback=progress_callback,
                )
            else:
                segments = self._transcribe_builtin_with_fallback(
                    audio_path=str(prepared_audio_path),
                    duration=duration,
                    model_name=model_name,
                    device=device,
                    language=language,
                    initial_prompt=initial_prompt,
                    vad_filter=vad_filter,
                    progress_callback=progress_callback,
                )
        except TaskControlRequested:
            raise
        except Exception as error:
            label = "CLI" if use_cli else "Built-in"
            logger.error("{} transcription failed: {}", label, error)
            return TaskResult(success=False, error=f"{label} transcription failed: {error}")
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

        return self._build_result(
            segments,
            audio_path=audio_path,
            duration=duration,
            language=language,
            task_id=task_id,
            progress_callback=progress_callback,
        )

    def _transcribe_cli(
        self,
        *,
        audio_path,
        work_dir,
        model_name,
        device,
        language,
        initial_prompt,
        vad_filter,
        progress_callback,
    ):
        self._model_manager.ensure_model_downloaded(model_name, progress_callback)
        self._prewarm.join_running(
            model_name=model_name,
            device=device,
            reason="real transcription is starting",
            progress_callback=progress_callback,
        )
        config = FasterWhisperConfig(
            audio_path=audio_path,
            output_dir=work_dir,
            model_name=model_name,
            model_dir=settings.ASR_MODEL_DIR,
            language=language,
            initial_prompt=initial_prompt,
            vad_filter=vad_filter,
            device=device,
        )
        return self._engines.execute_cli_with_device_fallback(config, progress_callback)

    def _transcribe_builtin_with_fallback(self, **kwargs):
        try:
            return self._engines.transcribe_builtin(**kwargs)
        except RuntimeError as error:
            if kwargs["device"] != "cuda" or not self._engines.is_cuda_unavailable_error(error):
                raise
            logger.warning("Built-in CUDA runtime unavailable, retrying on CPU: {}", error)
            self._model_manager.clear_loaded_model()
            progress_callback = kwargs.get("progress_callback")
            if progress_callback:
                progress_callback(8, "asr_cuda_cpu_fallback", {"device": "cpu"})
            return self._engines.transcribe_builtin(**{**kwargs, "device": "cpu"})

    @staticmethod
    def _audio_duration(audio_path: str) -> float:
        try:
            duration = AudioProcessor.get_audio_duration(audio_path)
            logger.info("Audio duration: {:.2f}s", duration)
            return duration
        except Exception as error:
            logger.error("Failed to get audio duration: {}", error)
            return 0.0

    @staticmethod
    def _build_result(
        segments,
        *,
        audio_path,
        duration,
        language,
        task_id,
        progress_callback,
    ) -> TaskResult:
        normalized = SegmentRefiner.normalize_segments(segments, rebalance=False) if segments else []
        full_text = "\n".join(segment.text for segment in normalized)
        if progress_callback:
            progress_callback(100, "transcription_completed", {})

        srt_path = SubtitleWriter.save_srt(normalized, audio_path)
        subtitle_ref = create_media_ref(
            str(srt_path),
            "application/x-subrip",
            role="output",
        )
        if subtitle_ref is None:
            return TaskResult(success=False, error="Transcription output could not be referenced")

        logger.success("Transcription complete. Total segments: {}", len(normalized))
        return TaskResult(
            success=True,
            artifacts=[TaskArtifact(kind="subtitle", role="output", ref=subtitle_ref)],
            outputs=PipelineOutputs(
                transcription=TranscriptionOutput(
                    task_id=task_id or "sync_task",
                    language=language or "auto",
                    duration=duration,
                    segments=normalized,
                    text=full_text,
                )
            ),
        )

    def transcribe_segment(
        self,
        *,
        audio_path: str,
        start: float,
        end: float,
        model_name: str = "base",
        device: str = "cpu",
        language: str | None = None,
        engine: TranscriptionEngine = "builtin",
        vad_filter: bool = DEFAULT_ASR_VAD_FILTER,
        task_id: str | None = None,
        initial_prompt: str | None = None,
        progress_callback=None,
    ) -> TaskResult:
        segment_id = str(uuid.uuid4())[:8]
        segment_path = create_segment_audio_path(segment_id)
        try:
            AudioProcessor.extract_segment(audio_path, start, end, str(segment_path))
            result = self.transcribe(
                audio_path=str(segment_path),
                model_name=model_name,
                device=device,
                language=language,
                engine=engine,
                vad_filter=vad_filter,
                task_id=task_id or f"seg_{segment_id}",
                initial_prompt=initial_prompt,
                progress_callback=progress_callback,
            )
            if result.success:
                transcription_output = result.outputs.transcription
                if transcription_output is None:
                    return TaskResult(
                        success=False,
                        error="Transcription completed without a typed output",
                    )
                for segment in transcription_output.segments:
                    segment.start += start
                    segment.end += start
            return result
        except TaskControlRequested:
            raise
        except Exception as error:
            logger.error("Segment transcription failed: {}", error)
            return TaskResult(success=False, error=str(error))
        finally:
            if segment_path.exists():
                try:
                    os.remove(segment_path)
                except OSError:
                    pass

from loguru import logger

from backend.core.asr_execution import (
    LONG_AUDIO_SECONDS,
    batch_size_for,
    is_out_of_memory,
)
from backend.models.subtitle_contracts import SubtitleSegment
from backend.services.runtime_diagnostics import RuntimeDiagnosticsService


class ASREngineExecutor:
    def __init__(self, *, model_manager, adapter, core_strategies):
        self._model_manager = model_manager
        self._adapter = adapter
        self._core_strategies = core_strategies

    def execute_cli_with_device_fallback(
        self,
        config,
        progress_callback=None,
    ) -> list[SubtitleSegment]:
        active_config = config
        attempt = 0
        while True:
            try:
                return self._adapter.execute(active_config, progress_callback)
            except RuntimeError as cli_error:
                if is_out_of_memory(cli_error):
                    if active_config.batch_size <= 1:
                        raise
                    attempt += 1
                    batch_size = max(1, active_config.batch_size // 2)
                    logger.warning("ASR memory exhausted; retrying batch_size={} with unchanged precision", batch_size)
                    active_config = active_config.model_copy(update={
                        "batch_size": batch_size,
                        "output_dir": config.output_dir / f"retry-{attempt}",
                    })
                    continue
                if (
                    active_config.device == "cuda"
                    and self.is_cuda_unavailable_error(cli_error)
                ):
                    logger.warning("CLI CUDA unavailable, retrying on CPU: {}", cli_error)
                    if progress_callback:
                        progress_callback(0, "asr_cuda_cpu_fallback", {"device": "cpu"})
                    attempt += 1
                    active_config = active_config.model_copy(update={
                        "device": "cpu", "batch_size": 1,
                        "output_dir": config.output_dir / f"retry-{attempt}",
                    })
                    continue
                raise

    def transcribe_builtin(
        self,
        *,
        audio_path: str,
        duration: float,
        model_name: str,
        device: str,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
        progress_callback=None,
    ) -> list[SubtitleSegment]:
        model = self._model_manager.load_model(model_name, device, progress_callback)
        if duration > LONG_AUDIO_SECONDS:
            return self._core_strategies.transcribe_smart_split(
                audio_path,
                duration,
                model,
                language,
                initial_prompt,
                vad_filter,
                progress_callback,
                batch_size=batch_size_for(duration, device, vad_filter),
            )
        return self._core_strategies.transcribe_direct(
            audio_path,
            duration,
            model,
            language,
            initial_prompt,
            vad_filter,
            progress_callback,
        )

    @staticmethod
    def is_cuda_unavailable_error(error: Exception) -> bool:
        return not is_out_of_memory(error) and RuntimeDiagnosticsService.is_cuda_runtime_unavailable_error(error)

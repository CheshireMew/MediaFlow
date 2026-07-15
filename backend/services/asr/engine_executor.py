from loguru import logger

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
        while True:
            try:
                return self._adapter.execute(active_config, progress_callback)
            except RuntimeError as cli_error:
                if (
                    active_config.device == "cuda"
                    and self.is_cuda_unavailable_error(cli_error)
                ):
                    logger.warning("CLI CUDA unavailable, retrying on CPU: {}", cli_error)
                    if progress_callback:
                        progress_callback(0, "asr_cuda_cpu_fallback", {"device": "cpu"})
                    active_config = active_config.model_copy(update={"device": "cpu"})
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
        if duration > 900:
            return self._core_strategies.transcribe_smart_split(
                audio_path,
                duration,
                model,
                language,
                initial_prompt,
                vad_filter,
                progress_callback,
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
        return RuntimeDiagnosticsService.is_cuda_runtime_unavailable_error(error)

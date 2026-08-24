import threading
from pathlib import Path
from typing import Any

from loguru import logger

from backend.core.task_control import TaskControlRequested
from backend.services.asr.model_download_service import ModelDownloadService


class ModelManager:
    def __init__(self, download_service: ModelDownloadService | None = None):
        self._download_service = download_service or ModelDownloadService()
        self._model_instance = None
        self._current_model_name = None
        self._current_device = None
        self._model_lock = threading.RLock()

    @property
    def model_map(self):
        return self._download_service.model_map

    def ensure_model_downloaded(self, model_name: str, progress_callback=None) -> str:
        return self._download_service.ensure_model_downloaded(model_name, progress_callback)

    def get_cached_model_path(self, model_name: str) -> Path:
        return self._download_service.get_cached_model_path(model_name)

    def load_model(self, model_name: str, device: str, progress_callback=None) -> Any:
        """
        Load or reload the Whisper model securely from the local models directory.
        """
        with self._model_lock:
            if (
                self._model_instance is not None
                and self._current_model_name == model_name
                and self._current_device == device
            ):
                return self._model_instance

            logger.info(f"Loading Whisper Model: {model_name} on {device}...")

            from faster_whisper import WhisperModel

            try:
                compute_type = "float16" if device == "cuda" else "int8"
                local_model_path = self.ensure_model_downloaded(model_name, progress_callback)

                if progress_callback:
                    progress_callback(
                        8,
                        "asr_model_initializing",
                        {"model": model_name, "device": device},
                    )
                model_instance = WhisperModel(
                    local_model_path,
                    device=device,
                    compute_type=compute_type,
                    download_root=None,
                )
                self._model_instance = model_instance
                self._current_model_name = model_name
                self._current_device = device
                logger.success(f"Model {model_name} loaded successfully.")
                if progress_callback:
                    progress_callback(10, "asr_model_loaded", {"model": model_name})
                return model_instance
            except TaskControlRequested:
                raise
            except Exception as e:
                logger.error(f"Failed to load model {model_name}: {e}")
                raise RuntimeError(f"Model loading failed: {e}")

    def clear_loaded_model(self) -> None:
        with self._model_lock:
            self._model_instance = None
            self._current_model_name = None
            self._current_device = None

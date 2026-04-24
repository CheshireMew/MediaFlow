import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from loguru import logger
from tqdm.auto import tqdm

from backend.config import settings
from backend.core.task_control import TaskControlRequested


ModelProgressCallback = Optional[Callable[[float, str], None]]


class _SilentTqdm(tqdm):
    def __init__(self, *args, **kwargs):
        kwargs["disable"] = True
        super().__init__(*args, **kwargs)


class _ModelDownloadProgressReporter:
    def __init__(
        self,
        *,
        model_name: str,
        source_label: str,
        progress_callback: ModelProgressCallback = None,
        progress_start: float = 0.0,
        progress_end: float = 8.0,
        total_bytes: Optional[int] = None,
    ) -> None:
        self._model_name = model_name
        self._source_label = source_label
        self._progress_callback = progress_callback
        self._progress_start = float(progress_start)
        self._progress_span = max(float(progress_end) - float(progress_start), 0.0)
        self._resolved_total_bytes = max(int(total_bytes or 0), 0)
        self._known_total_bytes = self._resolved_total_bytes
        self._downloaded_bytes = 0
        self._file_sizes: dict[str, int] = {}
        self._file_downloaded: dict[str, int] = {}
        self._file_counter = 0
        self._last_progress = self._progress_start
        self._last_emit_at = 0.0
        self._lock = threading.Lock()

    def set_total_bytes(self, total_bytes: Optional[int]) -> None:
        normalized_total = max(int(total_bytes or 0), 0)
        if normalized_total <= 0:
            return

        with self._lock:
            self._resolved_total_bytes = normalized_total
            self._known_total_bytes = max(self._known_total_bytes, normalized_total)

    def build_callback_type(self):
        from modelscope.hub.callback import ProgressCallback

        reporter = self

        class _ProgressCallback(ProgressCallback):
            def __init__(self, filename: str, file_size: int):
                super().__init__(filename, file_size)
                self._file_key = reporter.register_file(filename, file_size)

            def update(self, size: int):
                reporter.update(self._file_key, size)

            def end(self):
                reporter.finish(self._file_key)

        return _ProgressCallback

    def register_file(self, filename: str, file_size: int) -> str:
        normalized_size = max(int(file_size or 0), 0)
        with self._lock:
            self._file_counter += 1
            file_key = f"{self._file_counter}:{filename}"
            self._file_sizes[file_key] = normalized_size
            self._file_downloaded[file_key] = 0
            if self._resolved_total_bytes <= 0:
                self._known_total_bytes += normalized_size
            self._emit_locked(force=True, active_filename=filename)
            return file_key

    def update(self, file_key: str, delta_size: int) -> None:
        normalized_delta = max(int(delta_size or 0), 0)
        if normalized_delta <= 0:
            return

        with self._lock:
            current = self._file_downloaded.get(file_key, 0)
            limit = self._file_sizes.get(file_key, 0)
            next_value = current + normalized_delta
            if limit > 0:
                next_value = min(next_value, limit)
            applied = max(next_value - current, 0)
            if applied <= 0:
                return

            self._file_downloaded[file_key] = next_value
            self._downloaded_bytes += applied
            active_name = file_key.split(":", 1)[-1]
            self._emit_locked(active_filename=active_name)

    def finish(self, file_key: str) -> None:
        with self._lock:
            target = self._file_sizes.get(file_key, 0)
            current = self._file_downloaded.get(file_key, 0)
            applied = max(target - current, 0)
            if applied > 0:
                self._file_downloaded[file_key] = target
                self._downloaded_bytes += applied
            active_name = file_key.split(":", 1)[-1]
            self._emit_locked(force=True, active_filename=active_name)

    def advance(self, delta_size: int | float, active_filename: Optional[str] = None) -> None:
        normalized_delta = max(int(delta_size or 0), 0)
        if normalized_delta <= 0:
            return

        with self._lock:
            self._downloaded_bytes += normalized_delta
            self._emit_locked(active_filename=active_filename)

    def complete(self, message: Optional[str] = None) -> None:
        with self._lock:
            if self._resolved_total_bytes > 0:
                self._downloaded_bytes = max(self._downloaded_bytes, self._resolved_total_bytes)
            else:
                self._downloaded_bytes = max(self._downloaded_bytes, self._known_total_bytes)

            self._last_progress = self._progress_start + self._progress_span
            self._emit_raw_locked(
                self._last_progress,
                message or f"Downloaded model {self._model_name}.",
            )

    def _emit_locked(self, force: bool = False, active_filename: Optional[str] = None) -> None:
        total_bytes = self._resolved_total_bytes or self._known_total_bytes
        if total_bytes <= 0:
            progress = self._last_progress
        else:
            ratio = min(self._downloaded_bytes / total_bytes, 1.0)
            progress = self._progress_start + ratio * self._progress_span
            progress = max(progress, self._last_progress)

        now = time.monotonic()
        should_emit = (
            force
            or progress > self._last_progress + 0.05
            or now - self._last_emit_at >= 0.4
        )
        if not should_emit:
            return

        self._last_progress = progress
        message = self._build_message(active_filename, total_bytes)
        self._emit_raw_locked(progress, message)

    def _emit_raw_locked(self, progress: float, message: str) -> None:
        if not self._progress_callback:
            return
        self._last_emit_at = time.monotonic()
        self._progress_callback(round(progress, 2), message)

    def _build_message(self, active_filename: Optional[str], total_bytes: int) -> str:
        prefix = f"Downloading model {self._model_name} from {self._source_label}"
        if total_bytes > 0:
            downloaded = min(self._downloaded_bytes, total_bytes)
            message = (
                f"{prefix}... "
                f"{self._format_bytes(downloaded)} / {self._format_bytes(total_bytes)}"
            )
        else:
            message = prefix + "..."

        if active_filename:
            return f"{message} ({Path(active_filename).name})"
        return message

    @staticmethod
    def _format_bytes(size: int) -> str:
        value = float(max(size, 0))
        units = ["B", "KB", "MB", "GB", "TB"]
        unit_index = 0
        while value >= 1024 and unit_index < len(units) - 1:
            value /= 1024
            unit_index += 1
        if unit_index == 0:
            return f"{int(value)} {units[unit_index]}"
        return f"{value:.1f} {units[unit_index]}"


class ModelManager:
    def __init__(self):
        self._model_instance = None
        self._current_model_name = None

    @property
    def model_map(self):
        return settings.ASR_MODELS

    def _resolve_modelscope_total_bytes(self, model_repo_id: str) -> Optional[int]:
        try:
            from modelscope.hub.api import HubApi

            api = HubApi()
            revision_detail = api.get_valid_revision_detail(model_repo_id)
            revision = revision_detail["Revision"]
            repo_files = api.get_model_files(
                model_id=model_repo_id,
                revision=revision,
                recursive=True,
            )
            total_size = 0
            for repo_file in repo_files:
                if repo_file.get("Type") == "tree":
                    continue
                size = repo_file.get("Size")
                if isinstance(size, (int, float)):
                    total_size += int(size)

            return total_size if total_size > 0 else None
        except Exception as exc:
            logger.debug(f"Failed to resolve ModelScope repo size for {model_repo_id}: {exc}")
            return None

    @staticmethod
    def _resolve_huggingface_repo_id(model_name: str) -> str:
        if "/" in model_name:
            return model_name

        from faster_whisper.utils import _MODELS

        repo_id = _MODELS.get(model_name)
        if repo_id is None:
            raise ValueError(f"Unsupported Hugging Face fallback model: {model_name}")
        return repo_id

    @staticmethod
    def _resolve_huggingface_allow_patterns() -> list[str]:
        return [
            "config.json",
            "preprocessor_config.json",
            "model.bin",
            "tokenizer.json",
            "vocabulary.*",
        ]

    def _resolve_huggingface_total_bytes(self, repo_id: str) -> Optional[int]:
        try:
            from huggingface_hub import snapshot_download

            dry_run_files = snapshot_download(
                repo_id,
                allow_patterns=self._resolve_huggingface_allow_patterns(),
                cache_dir=str(settings.ASR_MODEL_DIR),
                dry_run=True,
                tqdm_class=_SilentTqdm,
            )
            total_bytes = sum(
                int(getattr(file_info, "file_size", 0) or 0)
                for file_info in dry_run_files
                if bool(getattr(file_info, "will_download", True))
            )
            return total_bytes if total_bytes > 0 else None
        except Exception as exc:
            logger.debug(f"Failed to resolve Hugging Face repo size for {repo_id}: {exc}")
            return None

    def _download_from_modelscope(
        self,
        model_name: str,
        target_dir: Path,
        progress_callback: ModelProgressCallback = None,
    ) -> str:
        from modelscope.hub.snapshot_download import snapshot_download

        model_repo_id = self.model_map.get(model_name, model_name)
        logger.info(f"Attempting download from ModelScope: {model_repo_id}")
        total_bytes = self._resolve_modelscope_total_bytes(model_repo_id)
        reporter = _ModelDownloadProgressReporter(
            model_name=model_name,
            source_label="ModelScope",
            progress_callback=progress_callback,
            progress_start=0.0,
            progress_end=8.0,
            total_bytes=total_bytes,
        )
        if progress_callback:
            progress_callback(0, f"Preparing model download {model_name}...")

        local_model_path = snapshot_download(
            model_repo_id,
            local_dir=str(target_dir),
            progress_callbacks=[reporter.build_callback_type()],
        )
        logger.success(f"Model downloaded to: {local_model_path}")
        reporter.complete(f"Downloaded model {model_name}.")
        return local_model_path

    def _download_from_huggingface(
        self,
        model_name: str,
        target_dir: Path,
        progress_callback: ModelProgressCallback = None,
    ) -> str:
        from huggingface_hub import snapshot_download

        repo_id = self._resolve_huggingface_repo_id(model_name)
        allow_patterns = self._resolve_huggingface_allow_patterns()
        total_bytes = self._resolve_huggingface_total_bytes(repo_id)
        reporter = _ModelDownloadProgressReporter(
            model_name=model_name,
            source_label="Hugging Face",
            progress_callback=progress_callback,
            progress_start=2.0,
            progress_end=8.0,
            total_bytes=total_bytes,
        )

        class _HuggingFaceProgressTqdm(_SilentTqdm):
            def __init__(self, *args, **kwargs):
                self._is_bytes_bar = kwargs.get("unit") == "B"
                super().__init__(*args, **kwargs)
                if self._is_bytes_bar:
                    reporter.set_total_bytes(getattr(self, "total", None))

            def refresh(self, *args, **kwargs):
                result = super().refresh(*args, **kwargs)
                if self._is_bytes_bar:
                    reporter.set_total_bytes(getattr(self, "total", None))
                return result

            def update(self, n=1):
                result = super().update(n)
                if self._is_bytes_bar:
                    reporter.advance(n)
                return result

        if progress_callback:
            progress_callback(2, f"Preparing Hugging Face fallback for model {model_name}...")

        local_model_path = snapshot_download(
            repo_id,
            cache_dir=str(settings.ASR_MODEL_DIR),
            local_dir=str(target_dir),
            allow_patterns=allow_patterns,
            max_workers=4,
            tqdm_class=_HuggingFaceProgressTqdm,
        )
        logger.success(f"Model downloaded from Hugging Face to: {local_model_path}")
        reporter.complete(f"Downloaded model {model_name}.")
        return local_model_path

    def ensure_model_downloaded(self, model_name: str, progress_callback=None) -> str:
        """
        Ensure the model is downloaded to local storage, supporting ModelScope.
        Returns the local path to the model.
        """
        settings.ASR_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        target_dir = settings.ASR_MODEL_DIR / f"faster-whisper-{model_name}"

        if target_dir.exists() and any(target_dir.iterdir()):
            return str(target_dir)

        try:
            return self._download_from_modelscope(
                model_name,
                target_dir,
                progress_callback=progress_callback,
            )
        except ImportError:
            logger.warning("ModelScope not installed, falling back to Hugging Face...")
            if progress_callback:
                progress_callback(2, "ModelScope missing. Falling back to Hugging Face...")
            return self._download_from_huggingface(
                model_name,
                target_dir,
                progress_callback=progress_callback,
            )
        except Exception as e:
            logger.error(f"ModelScope download failed: {e}. Falling back to Hugging Face...")
            if progress_callback:
                progress_callback(
                    2,
                    f"ModelScope failed. Falling back to Hugging Face... ({str(e)[:20]})",
                )
            return self._download_from_huggingface(
                model_name,
                target_dir,
                progress_callback=progress_callback,
            )

    def load_model(self, model_name: str, device: str, progress_callback=None) -> Any:
        """
        Load or reload the Whisper model securely from the local models directory.
        """
        if self._model_instance and self._current_model_name == model_name:
            return self._model_instance

        logger.info(f"Loading Whisper Model: {model_name} on {device}...")

        from faster_whisper import WhisperModel

        try:
            compute_type = "float16" if device == "cuda" else "int8"
            local_model_path = self.ensure_model_downloaded(model_name, progress_callback)

            if progress_callback:
                progress_callback(8, f"Initializing {model_name} on {device}...")
            self._model_instance = WhisperModel(
                local_model_path,
                device=device,
                compute_type=compute_type,
                download_root=None,
            )
            self._current_model_name = model_name
            logger.success(f"Model {model_name} loaded successfully.")
            if progress_callback:
                progress_callback(10, "Model loaded successfully.")
            return self._model_instance
        except TaskControlRequested:
            raise
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            raise RuntimeError(f"Model loading failed: {e}")

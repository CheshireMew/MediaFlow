import threading
import time
from pathlib import Path
from tqdm.auto import tqdm

from backend.models.task_message import TaskProgressCallback

ModelProgressCallback = TaskProgressCallback | None

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
        total_bytes: int | None = None,
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

    def set_total_bytes(self, total_bytes: int | None) -> None:
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

    def advance(self, delta_size: float, active_filename: str | None = None) -> None:
        normalized_delta = max(int(delta_size or 0), 0)
        if normalized_delta <= 0:
            return

        with self._lock:
            self._downloaded_bytes += normalized_delta
            self._emit_locked(active_filename=active_filename)

    def complete(self) -> None:
        with self._lock:
            if self._resolved_total_bytes > 0:
                self._downloaded_bytes = max(self._downloaded_bytes, self._resolved_total_bytes)
            else:
                self._downloaded_bytes = max(self._downloaded_bytes, self._known_total_bytes)

            self._last_progress = self._progress_start + self._progress_span
            self._emit_raw_locked(
                self._last_progress,
                "asr_model_downloading",
                self._build_params(None, self._resolved_total_bytes or self._known_total_bytes),
            )

    def _emit_locked(self, force: bool = False, active_filename: str | None = None) -> None:
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
        message_params = self._build_params(active_filename, total_bytes)
        self._emit_raw_locked(progress, "asr_model_downloading", message_params)

    def _emit_raw_locked(
        self,
        progress: float,
        message_code: str,
        message_params: dict,
    ) -> None:
        if not self._progress_callback:
            return
        self._last_emit_at = time.monotonic()
        bounded_progress = max(
            self._progress_start,
            min(self._progress_start + self._progress_span, float(progress)),
        )
        self._progress_callback(
            round(bounded_progress, 2),
            message_code,
            message_params,
        )

    def _build_params(self, active_filename: str | None, total_bytes: int) -> dict:
        return {
            "model": self._model_name,
            "source": self._source_label,
            "file": Path(active_filename).name if active_filename else "",
            "downloaded_bytes": min(self._downloaded_bytes, total_bytes)
            if total_bytes > 0
            else self._downloaded_bytes,
            "total_bytes": total_bytes,
        }

from typing import Callable, Optional, Dict
from loguru import logger
import re

from backend.models.task_message import TaskProgressCallback

# Type aliases for callback functions
CancelCheckCallback = Callable[[], bool]          # () -> bool (True if cancelled)

def clean_ansi(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


def _parse_progress_percent(payload: Dict) -> float:
    downloaded = payload.get("downloaded_bytes")
    total = payload.get("total_bytes") or payload.get("total_bytes_estimate")
    if isinstance(downloaded, (int, float)) and isinstance(total, (int, float)) and total > 0:
        return max(0.0, min(100.0, (float(downloaded) / float(total)) * 100.0))

    raw_percent = clean_ansi(str(payload.get("_percent_str", "0%"))).replace("%", "").strip()
    if raw_percent and raw_percent != "N/A":
        return max(0.0, min(100.0, float(raw_percent)))

    return 0.0


def _progress_params(payload: Dict, percent: float) -> dict:
    eta = clean_ansi(str(payload.get("_eta_str", ""))).strip()
    speed = clean_ansi(str(payload.get("_speed_str", ""))).strip()
    total = clean_ansi(str(payload.get("_total_bytes_str", ""))).strip()

    return {
        "percent": round(percent, 1),
        "total": total,
        "speed": speed,
        "eta": eta,
    }

class ProgressHook:
    def __init__(
        self,
        progress_callback: Optional[TaskProgressCallback],
        check_cancel_callback: Optional[CancelCheckCallback],
        *,
        stage_label: str = "Downloading",
    ):
        self.progress_callback = progress_callback
        self.check_cancel_callback = check_cancel_callback
        self.stage_label = stage_label
        self._last_percent = 0.0

    def __call__(self, d: Dict):
        if self.check_cancel_callback and self.check_cancel_callback():
            raise Exception("Download cancelled by user")

        status = d.get("status")

        if status == "downloading":
            try:
                percent = _parse_progress_percent(d)
                percent = max(self._last_percent, percent)
                self._last_percent = percent

                if self.progress_callback:
                    self.progress_callback(
                        percent,
                        "download_progress",
                        _progress_params(d, percent),
                    )
            except Exception as e:
                logger.warning(f"Error in progress hook: {e}")

        elif status == "finished":
            self._last_percent = max(self._last_percent, 100.0)
            if self.progress_callback:
                self.progress_callback(100.0, "download_stage_completed", {})
        elif status == "error":
            logger.warning(f"yt-dlp reported error status: {d.get('error', 'unknown')}")

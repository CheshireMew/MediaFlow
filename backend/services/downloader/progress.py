from typing import Callable, Optional, Dict
from loguru import logger
import re

# Type aliases for callback functions
ProgressCallback = Callable[[float, str], None]  # (progress: float, message: str) -> None
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


def _build_progress_message(payload: Dict, percent: float) -> str:
    eta = clean_ansi(str(payload.get("_eta_str", ""))).strip()
    speed = clean_ansi(str(payload.get("_speed_str", ""))).strip()
    total = clean_ansi(str(payload.get("_total_bytes_str", ""))).strip()

    parts = [f"Downloading: {percent:.1f}%"]
    if total:
        parts.append(total)
    if speed:
        parts.append(speed)
    if eta:
        parts.append(f"{eta} left")
    return " - ".join(parts)

class ProgressHook:
    def __init__(self, progress_callback: Optional[ProgressCallback], check_cancel_callback: Optional[CancelCheckCallback]):
        self.progress_callback = progress_callback
        self.check_cancel_callback = check_cancel_callback

    def __call__(self, d: Dict):
        # 1. Check for cancellation
        if self.check_cancel_callback and self.check_cancel_callback():
            raise Exception("Download cancelled by user")

        status = d.get('status')

        # 2. Update progress
        if status == 'downloading':
            try:
                percent = _parse_progress_percent(d)

                if self.progress_callback:
                    self.progress_callback(percent, _build_progress_message(d, percent))
            except Exception as e:
                logger.warning(f"Error in progress hook: {e}")

        elif status == 'finished':
            if self.progress_callback:
                self.progress_callback(100.0, "Processing completed")
        elif status == 'error':
            logger.warning(f"yt-dlp reported error status: {d.get('error', 'unknown')}")

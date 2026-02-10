from typing import Callable, Optional, Dict
from loguru import logger
import re

# Type aliases for callback functions
ProgressCallback = Callable[[float, str], None]  # (progress: float, message: str) -> None
CancelCheckCallback = Callable[[], bool]          # () -> bool (True if cancelled)

def clean_ansi(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

class ProgressHook:
    def __init__(self, progress_callback: Optional[ProgressCallback], check_cancel_callback: Optional[CancelCheckCallback]):
        self.progress_callback = progress_callback
        self.check_cancel_callback = check_cancel_callback

    def __call__(self, d: Dict):
        # 1. Check for cancellation
        if self.check_cancel_callback and self.check_cancel_callback():
            raise Exception("Download cancelled by user")

        # 2. Update progress
        if d['status'] == 'downloading':
            try:
                # Extract percentage
                raw_percent = d.get('_percent_str', '0%')
                clean_percent = clean_ansi(raw_percent).replace('%','')
                percent = float(clean_percent) if clean_percent != 'N/A' else 0.0
                
                if self.progress_callback:
                    self.progress_callback(percent, f"Downloading: {clean_ansi(d.get('_percent_str', ''))} - {clean_ansi(d.get('_eta_str', ''))} left")
            except Exception as e:
                logger.warning(f"Error in progress hook: {e}")
                
        elif d['status'] == 'finished':
            if self.progress_callback:
                self.progress_callback(100.0, "Processing completed")

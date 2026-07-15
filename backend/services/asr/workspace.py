import tempfile
from pathlib import Path

from backend.config import settings


def create_transcription_work_dir(task_id: str | None) -> Path:
    base_dir = settings.TEMP_DIR / "asr-work"
    base_dir.mkdir(parents=True, exist_ok=True)
    safe_task_id = "".join(
        char if char.isascii() and (char.isalnum() or char in {"-", "_"}) else "_"
        for char in (task_id or "sync")
    )[:32] or "sync"
    return Path(tempfile.mkdtemp(prefix=f"transcribe-{safe_task_id}-", dir=base_dir))


def create_segment_audio_path(segment_id: str) -> Path:
    segment_dir = settings.TEMP_DIR / "asr-segments"
    segment_dir.mkdir(parents=True, exist_ok=True)
    return segment_dir / f"segment_{segment_id}.wav"

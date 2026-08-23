from __future__ import annotations

import hashlib
import subprocess
import threading
import time
import uuid
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.models.media_contracts import MediaReference
from backend.services.media_extensions import VIDEO_EXTENSIONS
from backend.utils.bounded_cache import prune_cache_directory

BROWSER_PREVIEW_VIDEO_EXTENSIONS = frozenset({".mp4", ".m4v", ".mov", ".webm"})
PREVIEW_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024
PREVIEW_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
PREVIEW_CACHE_PRUNE_INTERVAL_SECONDS = 5 * 60

_preview_remux_slots = threading.BoundedSemaphore(2)
_preview_cache_locks = tuple(threading.Lock() for _ in range(64))
_preview_prune_lock = threading.Lock()
_last_preview_prune_at = 0.0


def _preview_cache_key(source_path: Path) -> str:
    stat = source_path.stat()
    payload = f"{source_path.resolve()}|{stat.st_size}|{stat.st_mtime_ns}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def _preview_cache_dir() -> Path:
    cache_dir = settings.TEMP_DIR / "editor-preview-media"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _media_ref(path: Path, *, role: str, origin: str) -> MediaReference:
    return MediaReference(
        path=str(path),
        name=path.name,
        type="video/mp4" if path.suffix.lower() == ".mp4" else None,
        media_kind="video",
        role=role,
        origin=origin,
    )


def _maybe_prune_preview_cache(cache_dir: Path, *, protected: Path) -> None:
    global _last_preview_prune_at

    now = time.monotonic()
    if now - _last_preview_prune_at < PREVIEW_CACHE_PRUNE_INTERVAL_SECONDS:
        return
    with _preview_prune_lock:
        now = time.monotonic()
        if now - _last_preview_prune_at < PREVIEW_CACHE_PRUNE_INTERVAL_SECONDS:
            return
        prune_cache_directory(
            cache_dir,
            max_bytes=PREVIEW_CACHE_MAX_BYTES,
            max_age_seconds=PREVIEW_CACHE_MAX_AGE_SECONDS,
            protected=(protected,),
        )
        _last_preview_prune_at = now


def _read_cached_preview(preview_path: Path) -> bool:
    try:
        if not preview_path.is_file() or preview_path.stat().st_size <= 0:
            return False
        preview_path.touch()
        return True
    except OSError:
        return False


def resolve_editor_preview_media(source_path: str) -> tuple[MediaReference, MediaReference, bool]:
    source = Path(source_path).expanduser().resolve()
    source_suffix = source.suffix.lower()
    source_ref = _media_ref(source, role="source", origin="navigation")

    if source_suffix not in VIDEO_EXTENSIONS:
        return source_ref, source_ref, False

    if source_suffix in BROWSER_PREVIEW_VIDEO_EXTENSIONS:
        return source_ref, source_ref, False

    cache_dir = _preview_cache_dir()
    preview_path = cache_dir / f"{_preview_cache_key(source)}.mp4"
    if _read_cached_preview(preview_path):
        _maybe_prune_preview_cache(cache_dir, protected=preview_path)
        return source_ref, _media_ref(preview_path, role="preview", origin="task"), True

    cache_lock = _preview_cache_locks[hash(preview_path) % len(_preview_cache_locks)]
    with cache_lock:
        if _read_cached_preview(preview_path):
            _maybe_prune_preview_cache(cache_dir, protected=preview_path)
            return source_ref, _media_ref(preview_path, role="preview", origin="task"), True

        temp_path = preview_path.with_name(
            f"{preview_path.stem}.{uuid.uuid4().hex}.tmp.mp4"
        )
        try:
            cmd = [
                settings.FFMPEG_PATH,
                "-hide_banner",
                "-y",
                "-i",
                str(source),
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(temp_path),
            ]
            logger.info(
                f"[EditorPreview] Remuxing preview media: {source} -> {preview_path}"
            )
            with _preview_remux_slots:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                )
            if (
                result.returncode != 0
                or not temp_path.exists()
                or temp_path.stat().st_size <= 0
            ):
                stderr_tail = "\n".join((result.stderr or "").splitlines()[-20:])
                raise RuntimeError(f"Failed to create editor preview media:\n{stderr_tail}")
            temp_path.replace(preview_path)
        finally:
            temp_path.unlink(missing_ok=True)

    _maybe_prune_preview_cache(cache_dir, protected=preview_path)
    return source_ref, _media_ref(preview_path, role="preview", origin="task"), True

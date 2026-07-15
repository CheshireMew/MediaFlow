from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.models.media_contracts import MediaReference
from backend.services.media_extensions import VIDEO_EXTENSIONS


BROWSER_PREVIEW_VIDEO_EXTENSIONS = frozenset({".mp4", ".m4v", ".mov", ".webm"})


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


def resolve_editor_preview_media(source_path: str) -> tuple[MediaReference, MediaReference, bool]:
    source = Path(source_path).expanduser().resolve()
    source_suffix = source.suffix.lower()
    source_ref = _media_ref(source, role="source", origin="navigation")

    if source_suffix not in VIDEO_EXTENSIONS:
        return source_ref, source_ref, False

    if source_suffix in BROWSER_PREVIEW_VIDEO_EXTENSIONS:
        return source_ref, source_ref, False

    preview_path = _preview_cache_dir() / f"{_preview_cache_key(source)}.mp4"
    if preview_path.exists() and preview_path.stat().st_size > 0:
        return source_ref, _media_ref(preview_path, role="preview", origin="task"), True

    temp_path = preview_path.with_suffix(".tmp.mp4")
    if temp_path.exists():
        temp_path.unlink()

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
    logger.info(f"[EditorPreview] Remuxing preview media: {source} -> {preview_path}")
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0 or not temp_path.exists() or temp_path.stat().st_size <= 0:
        temp_path.unlink(missing_ok=True)
        stderr_tail = "\n".join((result.stderr or "").splitlines()[-20:])
        raise RuntimeError(f"Failed to create editor preview media:\n{stderr_tail}")

    temp_path.replace(preview_path)
    return source_ref, _media_ref(preview_path, role="preview", origin="task"), True

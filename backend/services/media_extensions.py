from __future__ import annotations

from pathlib import Path


VIDEO_EXTENSIONS = frozenset(
    {
        ".mp4",
        ".mkv",
        ".avi",
        ".mov",
        ".wmv",
        ".flv",
        ".webm",
        ".m4v",
        ".ts",
        ".mts",
    }
)
AUDIO_EXTENSIONS = frozenset(
    {
        ".mp3",
        ".wav",
        ".flac",
        ".aac",
        ".ogg",
        ".m4a",
        ".wma",
        ".opus",
    }
)
SUBTITLE_EXTENSIONS = frozenset({".srt", ".vtt", ".ass", ".ssa"})
IMAGE_EXTENSIONS = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp",
        ".gif",
        ".tiff",
        ".tif",
    }
)

EXTENSION_TO_MEDIA_KIND = {
    **{extension: "video" for extension in VIDEO_EXTENSIONS},
    **{extension: "audio" for extension in AUDIO_EXTENSIONS},
    **{extension: "subtitle" for extension in SUBTITLE_EXTENSIONS},
    **{extension: "image" for extension in IMAGE_EXTENSIONS},
}

MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS


def media_kind_from_extension(path: str | Path) -> str | None:
    return EXTENSION_TO_MEDIA_KIND.get(Path(path).suffix.lower())

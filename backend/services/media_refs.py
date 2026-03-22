from __future__ import annotations

import os
from typing import Optional


def create_media_ref(
    file_path: Optional[str],
    media_type: Optional[str] = None,
    *,
    role: Optional[str] = None,
    origin: str = "task",
) -> Optional[dict]:
    if not file_path or not isinstance(file_path, str):
        return None

    media_kind = "unknown"
    if media_type:
        if media_type.startswith("video"):
            media_kind = "video"
        elif media_type.startswith("audio"):
            media_kind = "audio"
        elif "subrip" in media_type:
            media_kind = "subtitle"
        elif media_type.startswith("image"):
            media_kind = "image"

    return {
        "path": file_path,
        "name": os.path.basename(file_path),
        "type": media_type,
        "media_kind": media_kind,
        "role": role,
        "origin": origin,
    }

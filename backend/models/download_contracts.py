from typing import Any, Literal

from pydantic import BaseModel


class PlaylistItem(BaseModel):
    index: int
    title: str
    url: str
    duration: float | None = None
    uploader: str | None = None


class AnalyzeResult(BaseModel):
    type: str
    platform: str | None = None
    id: str | None = None
    title: str
    url: str
    direct_src: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    count: int | None = None
    items: list[PlaylistItem] | None = None
    uploader: str | None = None
    webpage_url: str | None = None
    media_kind: Literal["video", "audio"] = "video"
    suggested_filename: str | None = None
    extra_info: dict[str, Any] | None = None

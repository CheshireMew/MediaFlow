from typing import Any

from pydantic import BaseModel, ConfigDict

from backend.models.media_contracts import MediaReference


class SynthesisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    srt_ref: MediaReference | None = None
    watermark_ref: MediaReference | None = None
    output_ref: MediaReference | None = None
    options: dict[str, Any] | None = None


class SynthesisRequest(SynthesisOptions):
    video_ref: MediaReference

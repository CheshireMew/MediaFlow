from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.synthesis_contracts import SynthesisOptions


class MediaExportTimelineRequest(BaseModel):
    video_ref: MediaReference
    speech_segments: list[SubtitleSegment] = Field(default_factory=list)


class MediaExportTimelineResponse(BaseModel):
    duration: float
    trim_start: float
    trim_end: float
    no_speech_trim_enabled: bool
    has_speech_timeline: bool
    has_leading_black: bool
    has_leading_no_speech: bool
    has_trailing_no_speech: bool


class EditorPreviewMediaRequest(BaseModel):
    video_ref: MediaReference


class EditorPreviewMediaResponse(BaseModel):
    source_ref: MediaReference
    media_ref: MediaReference
    remuxed: bool


class ImagePreviewResponse(BaseModel):
    png_path: str
    data_url: str
    width: int
    height: int


class ClipCandidate(BaseModel):
    id: str
    start: float
    end: float
    title: str | None = None
    reason: str | None = None
    score: float
    transcript: str | None = None
    selected: bool


class HighlightDetectionRequest(BaseModel):
    video_ref: MediaReference
    subtitle_segments: list[SubtitleSegment] = Field(default_factory=list)
    max_candidates: int = Field(default=6, ge=1, le=20)
    min_duration: float = Field(default=12.0, ge=1.0)
    max_duration: float = Field(default=75.0, ge=2.0)


class HighlightDetectionResponse(BaseModel):
    candidates: list[ClipCandidate]
    source: Literal["llm"]
    duration: float


class ClipExportSegment(BaseModel):
    id: str
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(ge=0, allow_inf_nan=False)
    title: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end <= self.start:
            raise ValueError("Clip end must be greater than start")
        return self


class ClipExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_ref: MediaReference
    segments: list[ClipExportSegment]
    render_mode: Literal["burned", "source"] = "burned"
    srt_ref: MediaReference | None = None
    watermark_ref: MediaReference | None = None
    options: SynthesisOptions | None = None
    output_dir: str | None = None

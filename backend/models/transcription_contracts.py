from typing import Literal

from pydantic import BaseModel

from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment


TranscriptionEngine = Literal["builtin", "cli"]
DEFAULT_ASR_VAD_FILTER = True


class TranscriptionOptions(BaseModel):
    engine: TranscriptionEngine = "builtin"
    model: str = "base"
    language: str | None = None
    device: str = "cpu"
    vad_filter: bool = DEFAULT_ASR_VAD_FILTER
    initial_prompt: str | None = None


class TranscribeRequest(TranscriptionOptions):
    audio_ref: MediaReference


class TranscribeSegmentRequest(TranscribeRequest):
    start: float
    end: float


class TranscribeSegmentData(BaseModel):
    text: str
    segments: list[SubtitleSegment]


class TranscribeSegmentResponse(BaseModel):
    status: Literal["completed"]
    data: TranscribeSegmentData

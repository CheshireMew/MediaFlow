from pydantic import BaseModel

from backend.models.media_contracts import MediaReference


class DetectSilenceRequest(BaseModel):
    audio_ref: MediaReference
    threshold: str = "-30dB"
    min_duration: float = 0.5


class DetectSilenceResponse(BaseModel):
    silence_intervals: list[tuple[float, float]]

from pydantic import BaseModel


class SubtitleSegment(BaseModel):
    id: str | int
    start: float
    end: float
    text: str

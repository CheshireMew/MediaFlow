from pydantic import BaseModel
from typing import Optional, List

class SubtitleLine(BaseModel):
    index: int
    start: float
    end: float
    text: str
    speaker: Optional[str] = None

class SubtitleFile(BaseModel):
    path: str
    language: str
    lines: List[SubtitleLine]
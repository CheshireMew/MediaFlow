from dataclasses import dataclass
from typing import List, Optional

from pydantic import BaseModel, Field

from backend.models.schemas import SubtitleSegment


class TranslatorSegment(BaseModel):
    id: str = Field(..., description="Original subtitle ID - must match input exactly")
    source_text: str = Field(..., description="Original source subtitle text - must match input exactly")
    text: str = Field(..., description="Translated text")


class IntelligentSegment(BaseModel):
    """Segment for intelligent mode (N-to-M mapping)."""

    text: str = Field(..., description="Translated and potentially merged/split text")
    time_percentage: float = Field(..., description="Estimated percentage of the total time block this segment occupies (0.0 to 1.0)")


class TranslationResponse(BaseModel):
    """Standard 1-to-1 translation response."""

    segments: List[TranslatorSegment] = Field(..., description="Translated segments - count and IDs MUST match input exactly")


class IntelligentTranslationResponse(BaseModel):
    """Intelligent N-to-M translation response."""

    segments: List[IntelligentSegment] = Field(..., description="List of semantic segments. Number of segments can differ from input.")


@dataclass
class TranslationOutcome:
    segments: List[SubtitleSegment]
    cacheable: bool


@dataclass(frozen=True)
class TranslationBatch:
    index: int
    segments: List[SubtitleSegment]
    context_before: Optional[List[SubtitleSegment]]

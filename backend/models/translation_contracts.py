from typing import Literal

from pydantic import BaseModel, Field

from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.translation_mode import TranslationMode
from backend.models.translation_target_language import (
    DEFAULT_TRANSLATION_TARGET_LANGUAGE,
    TranslationTargetLanguage,
)


class TranslationOptions(BaseModel):
    target_language: TranslationTargetLanguage = DEFAULT_TRANSLATION_TARGET_LANGUAGE
    mode: TranslationMode = "standard"
    context_ref: MediaReference | None = None
    batch_size: int = Field(default=10, ge=1)


class TranslationRequest(TranslationOptions):
    segments: list[SubtitleSegment]


class ImmediateTranslationResponse(BaseModel):
    status: Literal["completed"]
    segments: list[SubtitleSegment]
    language: str
    context_ref: MediaReference | None = None
    subtitle_ref: MediaReference | None = None
    mode: str

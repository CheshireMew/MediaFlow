from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.translation_mode import TranslationMode
from backend.models.translation_target_language import TranslationTargetLanguage


class DownloadOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    duration: float
    filename: str
    source_url: str
    warnings: list[str] = Field(default_factory=list)
    recovery_strategies: list[str] = Field(default_factory=list)


class TranscriptionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    language: str
    duration: float
    segments: list[SubtitleSegment]
    text: str


class TranslationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segments: list[SubtitleSegment]
    language: TranslationTargetLanguage
    mode: TranslationMode


class SynthesisOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completed: Literal[True] = True


class ClipExportOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    count: int = Field(ge=0)


class PipelineOutputs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    download: DownloadOutput | None = None
    transcription: TranscriptionOutput | None = None
    translation: TranslationOutput | None = None
    synthesis: SynthesisOutput | None = None
    clip_export: ClipExportOutput | None = None


class TaskExecutionTraceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: str
    duration: float
    status: Literal["success", "failed"]
    error: str | None = None
    timestamp: float

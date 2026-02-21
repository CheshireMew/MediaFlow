from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class TaskResult(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class TaskResponse(BaseModel):
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[TaskResult] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class FileRef(BaseModel):
    path: str
    filename: str
    size: Optional[int] = None
    mime_type: Optional[str] = None

class TranscribeRequest(BaseModel):
    source: str
    language: Optional[str] = "auto"
    model: Optional[str] = "base"
    output_format: Optional[str] = "srt"

class SubtitleSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None

class TranslateRequest(BaseModel):
    subtitles: List[SubtitleSegment]
    source_lang: str
    target_lang: str
    glossary: Optional[Dict[str, str]] = None

class PipelineRequest(BaseModel):
    source: str
    tasks: List[str] = ["transcribe", "translate"]
    config: Optional[Dict[str, Any]] = None

class AnalyzeResult(BaseModel):
    url: str
    title: Optional[str] = None
    duration: Optional[float] = None
    formats: Optional[List[Dict[str, Any]]] = None
    thumbnail: Optional[str] = None

class PreprocessRequest(BaseModel):
    source: str
    operations: List[str] = []

class PreprocessResponse(BaseModel):
    success: bool
    output_path: str
    metadata: Optional[Dict[str, Any]] = None

class SynthesizeRequest(BaseModel):
    subtitles: List[SubtitleSegment]
    video_path: str
    font: Optional[str] = None
    font_size: Optional[int] = 24
    color: Optional[str] = "#FFFFFF"
class SynthesisRequest(BaseModel):
    subtitles: List[SubtitleSegment]
    video_path: str
    font: Optional[str] = None
    font_size: Optional[int] = 24
    color: Optional[str] = "#FFFFFF"
    position: Optional[str] = "bottom"
    background: Optional[bool] = False
class GlossaryTerm(BaseModel):
    source: str
    target: str
    context: Optional[str] = None
    notes: Optional[str] = None

class GlossaryRequest(BaseModel):
    terms: List[GlossaryTerm]
    name: Optional[str] = None
    language_pair: Optional[str] = None
class PipelineStepRequest(BaseModel):
    step_name: str
    config: Optional[Dict[str, Any]] = None

class TranscribeResponse(BaseModel):
    success: bool
    subtitles: List[SubtitleSegment] = []
    file: Optional[FileRef] = None
    error: Optional[str] = None


class PlaylistItem(BaseModel):
    title: str
    url: str
    duration: Optional[float] = None
    thumbnail: Optional[str] = None
    index: Optional[int] = None

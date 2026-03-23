from pydantic import BaseModel, HttpUrl, Field, model_validator
from typing import Optional, List, Union, Dict, Any, Literal, Annotated

from backend.utils.media_inputs import MediaInputModel

class DownloadRequest(BaseModel):
    url: HttpUrl
    format: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4"
    proxy: Optional[str] = None
    output_filename: Optional[str] = None

class MediaAsset(BaseModel):
    id: str
    filename: str
    path: str
    duration: Optional[float] = None
    title: Optional[str] = None
    subtitle_path: Optional[str] = None  # Path to downloaded subtitle file (.srt/.vtt)


class MediaReference(BaseModel):
    path: str
    name: str
    size: Optional[int] = None
    type: Optional[str] = None
    media_id: Optional[str] = None
    media_kind: Optional[str] = None
    role: Optional[str] = None
    origin: Optional[str] = None

TranscriptionEngine = Literal["builtin", "cli"]

class TranscribeRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("audio_path", "audio_ref"),)
    audio_path: Optional[str] = Field(None, description="Absolute path to the audio/video file")
    audio_ref: Optional[MediaReference] = None
    engine: TranscriptionEngine = "builtin"
    model: str = "base"
    language: Optional[str] = None
    device: str = "cpu"  # or "cuda"
    vad_filter: bool = True
    initial_prompt: Optional[str] = None


class TranscribeSegmentRequest(TranscribeRequest):
    start: float
    end: float

class SubtitleSegment(BaseModel):
    id: str  # String for frontend compatibility
    start: float
    end: float
    text: str

class TranscribeResponse(BaseModel):
    task_id: str
    segments: list[SubtitleSegment]
    text: str
    language: str | None
    srt_path: str | None = None

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str = "Task started"

# Step Params (used in PipelineStepRequest discriminated union)

class DownloadParams(BaseModel):
    url: HttpUrl
    format: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4"
    proxy: Optional[str] = None
    output_dir: Optional[str] = None
    playlist_title: Optional[str] = None
    playlist_items: Optional[str] = None
    download_subs: bool = False
    resolution: str = "best"
    cookie_file: Optional[str] = None
    output_filename: Optional[str] = None
    filename: Optional[str] = None
    codec: str = "best"

    @model_validator(mode="after")
    def apply_legacy_output_filename(self) -> "DownloadParams":
        # Preserve older callers that still send output_filename.
        if not self.filename and self.output_filename:
            self.filename = self.output_filename
        return self

class TranscribeParams(MediaInputModel):
    MEDIA_INPUT_SPECS = (("audio_path", "audio_ref"),)
    audio_path: Optional[str] = None # Optional because it can come from context
    audio_ref: Optional[MediaReference] = None
    engine: TranscriptionEngine = "builtin"
    model: str = "base"
    language: Optional[str] = None
    device: str = "cpu"
    vad_filter: bool = True
    initial_prompt: Optional[str] = None

class TranslateParams(MediaInputModel):
    MEDIA_INPUT_SPECS = (("srt_path", "context_ref"),)
    """Parameters for the translate pipeline step."""
    srt_path: Optional[str] = None  # Optional: can come from pipeline context
    context_ref: Optional[MediaReference] = None
    target_language: str = "Chinese"
    mode: str = "standard"  # "standard" | "intelligent" | "proofread"
    batch_size: int = 50

class SynthesizeParams(MediaInputModel):
    MEDIA_INPUT_SPECS = (("video_path", "video_ref"), ("srt_path", "srt_ref"))
    """Parameters for the synthesize pipeline step."""
    video_path: Optional[str] = None   # Optional: can come from pipeline context
    video_ref: Optional[MediaReference] = None
    srt_path: Optional[str] = None     # Optional: can come from pipeline context
    srt_ref: Optional[MediaReference] = None
    output_path: Optional[str] = None  # Auto-generated if not provided
    output_ref: Optional[MediaReference] = None
    watermark_path: Optional[str] = None
    options: Optional[Dict[str, Any]] = None  # FFmpeg synthesis options

class SynthesisRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("video_path", "video_ref"), ("srt_path", "srt_ref"))
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    srt_path: Optional[str] = None
    srt_ref: Optional[MediaReference] = None
    watermark_path: Optional[str] = None
    output_path: Optional[str] = None
    output_ref: Optional[MediaReference] = None
    options: Optional[dict] = None


class TextEvent(BaseModel):
    start: float
    end: float
    text: str
    box: List[List[int]] = Field(default_factory=list)


class OCRExtractRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("video_path", "video_ref"),)
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    roi: Optional[List[int]] = None
    engine: str = "rapid"
    sample_rate: int = 2


class OCRExtractResponse(BaseModel):
    task_id: str
    status: str = "queued"
    message: str = "OCR task started"
    events: Optional[List[TextEvent]] = None


class EnhanceRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("video_path", "video_ref"),)
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    model: Optional[str] = None
    scale: str = "4x"
    method: str = "realesrgan"


class CleanRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("video_path", "video_ref"),)
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    roi: List[int]
    method: str = "telea"


class PreprocessingResponse(BaseModel):
    task_id: str
    status: str
    message: str

class BaseStepRequest(BaseModel):
    step_name: str

class DownloadStepRequest(BaseStepRequest):
    step_name: Literal["download"]
    params: DownloadParams

class TranscribeStepRequest(BaseStepRequest):
    step_name: Literal["transcribe"]
    params: TranscribeParams

class TranslateStepRequest(BaseStepRequest):
    step_name: Literal["translate"]
    params: TranslateParams

class SynthesizeStepRequest(BaseStepRequest):
    step_name: Literal["synthesize"]
    params: SynthesizeParams

# Discriminated Union — must list ALL step types for Pydantic validation
PipelineStepRequest = Annotated[
    Union[DownloadStepRequest, TranscribeStepRequest, TranslateStepRequest, SynthesizeStepRequest],
    Field(discriminator="step_name")
]

class PipelineRequest(BaseModel):
    pipeline_id: str = "default_ingest_flow"
    task_name: Optional[str] = None
    steps: List[PipelineStepRequest]

class PlaylistItem(BaseModel):
    """Single item in a playlist."""
    index: int
    title: str
    url: str
    duration: Optional[float] = None
    uploader: Optional[str] = None

class AnalyzeResult(BaseModel):
    """Result of URL analysis."""
    type: str  # "single" or "playlist"
    platform: Optional[str] = None # e.g. "douyin", "youtube"
    id: Optional[str] = None
    title: str
    url: str
    direct_src: Optional[str] = None # Direct video URL from sniffer
    thumbnail: Optional[str] = None
    duration: Optional[float] = None  # For single videos
    count: Optional[int] = None  # For playlists
    items: Optional[List[PlaylistItem]] = None  # For playlists
    uploader: Optional[str] = None # Added for platform parity
    webpage_url: Optional[str] = None # Added for platform parity
    extra_info: Optional[Dict[str, Any]] = None  # Platform-specific data (e.g., direct download URL)

class GlossaryTerm(BaseModel):
    id: str
    source: str = Field(..., description="Source term in original language")
    target: str = Field(..., description="Target translation")
    note: Optional[str] = None
    category: Optional[str] = "general"

class FileRef(BaseModel):
    """Reference to a file generated or used by a task."""
    type: str  # "video", "audio", "subtitle", "image"
    path: str
    label: Optional[str] = None # "source", "output", "translated"
    mime_type: Optional[str] = None

class TaskResult(BaseModel):
    """Standardized result for all tasks."""
    success: bool
    files: List[FileRef] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

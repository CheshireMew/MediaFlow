from pydantic import BaseModel, HttpUrl, Field, model_validator
from typing import Optional, List, Dict, Any, Literal

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE

class DownloadRequest(BaseModel):
    url: HttpUrl
    format: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4"
    proxy: Optional[str] = None

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

class TranscribeRequest(BaseModel):
    audio_ref: MediaReference
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

class TaskSubmissionMetadata(BaseModel):
    task_source: Literal["backend"]
    task_contract_version: int
    persistence_scope: str
    lifecycle: str
    queue_state: str
    queue_position: Optional[int]
    primary_operation: str


class TaskResponse(TaskSubmissionMetadata):
    task_id: str
    status: str
    message: str = "Task started"


class TaskView(BaseModel):
    id: str
    type: str
    status: str
    task_source: Literal["backend"]
    task_contract_version: int
    persistence_scope: str
    lifecycle: str
    progress: float
    name: Optional[str] = None
    message: str = ""
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    request_params: Optional[Dict[str, Any]] = None
    primary_operation: str
    artifacts: List["TaskArtifact"] = Field(default_factory=list)
    created_at: int
    queue_state: str
    queue_position: Optional[int] = None


class TranslateResponse(TaskSubmissionMetadata):
    task_id: str
    status: str
    segments: Optional[List[SubtitleSegment]] = None
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

class TranscribeParams(BaseModel):
    audio_ref: Optional[MediaReference] = None
    engine: TranscriptionEngine = "builtin"
    model: str = "base"
    language: Optional[str] = None
    device: str = "cpu"
    vad_filter: bool = True
    initial_prompt: Optional[str] = None

class TranslateParams(BaseModel):
    """Parameters for the translate pipeline step."""
    context_ref: Optional[MediaReference] = None
    target_language: str = "Chinese"
    mode: str = "standard"  # "standard" | "intelligent" | "proofread"
    batch_size: int = 50

class SynthesizeParams(BaseModel):
    """Parameters for the synthesize pipeline step."""
    video_ref: Optional[MediaReference] = None
    srt_ref: Optional[MediaReference] = None
    output_ref: Optional[MediaReference] = None
    watermark_path: Optional[str] = None
    options: Optional[Dict[str, Any]] = None  # FFmpeg synthesis options

class SynthesisRequest(BaseModel):
    video_ref: MediaReference
    srt_ref: MediaReference
    watermark_path: Optional[str] = None
    output_ref: Optional[MediaReference] = None
    options: Optional[dict] = None


class TextEvent(BaseModel):
    start: float
    end: float
    text: str
    box: List[List[int]] = Field(default_factory=list)


class OCRExtractRequest(BaseModel):
    video_ref: MediaReference
    roi: Optional[List[int]] = None
    engine: str = "rapid"
    sample_rate: int = 2


class OCRExtractResponse(TaskSubmissionMetadata):
    task_id: str
    status: str = "queued"
    message: str = "OCR task started"
    events: Optional[List[TextEvent]] = None


class EnhanceRequest(BaseModel):
    video_ref: MediaReference
    model: Optional[str] = None
    scale: str = "4x"
    method: str = "realesrgan"


class CleanRequest(BaseModel):
    video_ref: MediaReference
    roi: List[int]
    method: str = "telea"


class PreprocessingResponse(TaskSubmissionMetadata):
    task_id: str
    status: str
    message: str

PIPELINE_STEP_PARAM_MODELS: dict[str, type[BaseModel]] = {
    "download": DownloadParams,
    "transcribe": TranscribeParams,
    "translate": TranslateParams,
    "synthesize": SynthesizeParams,
}

class PipelineStepRequest(BaseModel):
    step_name: str
    params: Any

    @model_validator(mode="after")
    def validate_catalog_step(self):
        from backend.core.task_catalog import pipeline_step_names

        if self.step_name not in pipeline_step_names():
            raise ValueError(f"Unknown pipeline step: {self.step_name}")
        param_model = PIPELINE_STEP_PARAM_MODELS.get(self.step_name)
        if param_model is None:
            raise ValueError(f"Pipeline step has no parameter model: {self.step_name}")
        if not isinstance(self.params, param_model):
            self.params = param_model.model_validate(self.params)
        return self

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


class TaskArtifact(BaseModel):
    kind: Literal["video", "audio", "subtitle", "image", "file"]
    role: Literal["input", "output", "context"]
    ref: MediaReference

class TaskResult(BaseModel):
    """Standardized result for all tasks."""
    success: bool
    files: List[FileRef] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

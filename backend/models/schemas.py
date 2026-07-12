from pydantic import AfterValidator, BaseModel, HttpUrl, Field, model_validator
from typing import Annotated, Optional, List, Dict, Any, Literal

from pydantic import ConfigDict

from backend.models.translation_target_language import (
    DEFAULT_TRANSLATION_TARGET_LANGUAGE,
    TranslationTargetLanguage,
)
from backend.contracts import require_task_message_code


TaskMessageCode = Annotated[str, AfterValidator(require_task_message_code)]
TaskMessageParams = Dict[str, str | int | float | bool | None]


class MediaReference(BaseModel):
    path: str
    name: str
    size: Optional[int] = None
    type: Optional[str] = None
    media_id: Optional[str] = None
    media_kind: Optional[str] = None
    role: Optional[str] = None
    origin: Optional[str] = None


class TaskArtifact(BaseModel):
    kind: Literal["video", "audio", "subtitle", "image", "file"]
    role: Literal["input", "output", "context"]
    ref: MediaReference


class TaskResult(BaseModel):
    """Canonical persisted and wire result for every task."""

    model_config = ConfigDict(extra="forbid")

    success: bool
    artifacts: List[TaskArtifact] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

    @model_validator(mode="after")
    def enforce_artifact_boundary(self):
        if any(artifact.role != "output" for artifact in self.artifacts):
            raise ValueError("TaskResult artifacts must use the output role")

        media_path_keys = {
            "video_path",
            "audio_path",
            "subtitle_path",
            "srt_path",
            "image_path",
            "png_path",
            "json_path",
            "output_path",
            "media_path",
            "input_path",
            "source_path",
            "original_path",
            "context_path",
            "watermark_path",
        }

        def _contains_legacy_media_key(value: Any) -> bool:
            if isinstance(value, dict):
                for key, item in value.items():
                    lowered_key = str(key).lower()
                    if (
                        lowered_key.endswith("_ref")
                        or lowered_key.endswith("_refs")
                        or lowered_key in media_path_keys
                        or (
                            lowered_key.endswith("_paths")
                            and lowered_key.removesuffix("s") in media_path_keys
                        )
                    ):
                        return True
                    if _contains_legacy_media_key(item):
                        return True
            elif isinstance(value, list):
                return any(_contains_legacy_media_key(item) for item in value)
            return False

        if _contains_legacy_media_key(self.meta):
            raise ValueError(
                "TaskResult media references belong in artifacts, not meta"
            )
        return self


TranscriptionEngine = Literal["builtin", "cli"]
DEFAULT_ASR_VAD_FILTER = True


class TranscribeRequest(BaseModel):
    audio_ref: MediaReference
    engine: TranscriptionEngine = "builtin"
    model: str = "base"
    language: Optional[str] = None
    device: str = "cpu"  # or "cuda"
    vad_filter: bool = DEFAULT_ASR_VAD_FILTER
    initial_prompt: Optional[str] = None


class TranscribeSegmentRequest(TranscribeRequest):
    start: float
    end: float


class SubtitleSegment(BaseModel):
    id: str | int
    start: float
    end: float
    text: str


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
    message_code: TaskMessageCode
    message_params: TaskMessageParams


class TaskActionResponse(BaseModel):
    message_code: TaskMessageCode
    message_params: TaskMessageParams


class TaskStatusActionResponse(TaskActionResponse):
    status: str


class TaskCountActionResponse(TaskActionResponse):
    count: int


class TaskDeleteActionResponse(TaskActionResponse):
    task_id: str


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
    message_code: TaskMessageCode
    message_params: TaskMessageParams
    error: Optional[str] = None
    result: Optional[TaskResult] = None
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
    message_code: TaskMessageCode
    message_params: TaskMessageParams


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
    vad_filter: bool = DEFAULT_ASR_VAD_FILTER
    initial_prompt: Optional[str] = None


class TranslateParams(BaseModel):
    """Parameters for the translate pipeline step."""

    context_ref: Optional[MediaReference] = None
    target_language: TranslationTargetLanguage = DEFAULT_TRANSLATION_TARGET_LANGUAGE
    mode: str = "standard"  # "standard" | "intelligent" | "proofread"
    batch_size: int = 50


class TranslationRequest(BaseModel):
    segments: List[SubtitleSegment]
    target_language: TranslationTargetLanguage = DEFAULT_TRANSLATION_TARGET_LANGUAGE
    mode: str = "standard"
    context_ref: Optional[MediaReference] = None


class SynthesizeParams(BaseModel):
    """Parameters for the synthesize pipeline step."""

    model_config = ConfigDict(extra="forbid")

    video_ref: Optional[MediaReference] = None
    srt_ref: Optional[MediaReference] = None
    output_ref: Optional[MediaReference] = None
    watermark_ref: Optional[MediaReference] = None
    options: Optional[Dict[str, Any]] = None  # FFmpeg synthesis options


class SynthesisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_ref: MediaReference
    srt_ref: Optional[MediaReference] = None
    watermark_ref: Optional[MediaReference] = None
    output_ref: Optional[MediaReference] = None
    options: Optional[dict] = None


class MediaVisibleStartRequest(BaseModel):
    video_ref: MediaReference


class MediaVisibleStartResponse(BaseModel):
    visible_start: float
    has_leading_black: bool


class EditorPreviewMediaRequest(BaseModel):
    video_ref: MediaReference


class EditorPreviewMediaResponse(BaseModel):
    source_ref: MediaReference
    media_ref: MediaReference
    remuxed: bool


class ClipCandidate(BaseModel):
    id: str
    start: float
    end: float
    title: Optional[str] = None
    reason: Optional[str] = None
    score: float
    transcript: Optional[str] = None
    selected: bool


class HighlightDetectionRequest(BaseModel):
    video_ref: MediaReference
    subtitle_segments: List[SubtitleSegment] = Field(default_factory=list)
    max_candidates: int = Field(default=6, ge=1, le=20)
    min_duration: float = Field(default=12.0, ge=1.0)
    max_duration: float = Field(default=75.0, ge=2.0)


class HighlightDetectionResponse(BaseModel):
    candidates: List[ClipCandidate]
    source: Literal["llm"]
    duration: float


class ClipExportSegment(BaseModel):
    id: str
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(ge=0, allow_inf_nan=False)
    title: Optional[str] = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end <= self.start:
            raise ValueError("Clip end must be greater than start")
        return self


class ClipExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_ref: MediaReference
    segments: List[ClipExportSegment]
    render_mode: Literal["burned", "source"] = "burned"
    srt_ref: Optional[MediaReference] = None
    watermark_ref: Optional[MediaReference] = None
    options: Optional[dict] = None
    output_dir: Optional[str] = None


PIPELINE_STEP_PARAM_MODELS: dict[str, type[BaseModel]] = {
    "download": DownloadParams,
    "transcribe": TranscribeParams,
    "translate": TranslateParams,
    "synthesize": SynthesizeParams,
}

PipelineStepParams = (
    DownloadParams | TranscribeParams | TranslateParams | SynthesizeParams
)


class PipelineStepRequest(BaseModel):
    step_name: str
    params: PipelineStepParams

    @model_validator(mode="before")
    @classmethod
    def validate_catalog_step(cls, value):
        from backend.core.task_catalog import pipeline_step_names

        if not isinstance(value, dict):
            return value

        step_name = value.get("step_name")
        if step_name not in pipeline_step_names():
            raise ValueError(f"Unknown pipeline step: {step_name}")
        param_model = PIPELINE_STEP_PARAM_MODELS.get(step_name)
        if param_model is None:
            raise ValueError(f"Pipeline step has no parameter model: {step_name}")
        if "params" not in value:
            return value
        return {
            **value,
            "params": param_model.model_validate(value["params"]),
        }


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
    platform: Optional[str] = None  # e.g. "douyin", "youtube"
    id: Optional[str] = None
    title: str
    url: str
    direct_src: Optional[str] = None  # Direct video URL from sniffer
    thumbnail: Optional[str] = None
    duration: Optional[float] = None  # For single videos
    count: Optional[int] = None  # For playlists
    items: Optional[List[PlaylistItem]] = None  # For playlists
    uploader: Optional[str] = None  # Added for platform parity
    webpage_url: Optional[str] = None  # Added for platform parity
    extra_info: Optional[Dict[str, Any]] = (
        None  # Platform-specific data (e.g., direct download URL)
    )


class GlossaryTerm(BaseModel):
    id: str
    source: str = Field(..., description="Source term in original language")
    target: str = Field(..., description="Target translation")
    note: Optional[str] = None
    category: Optional[str] = "general"


class CreateGlossaryTermRequest(BaseModel):
    source: str
    target: str
    note: Optional[str] = None
    category: str = "general"


class UpdateGlossaryTermRequest(BaseModel):
    source: Optional[str] = None
    target: Optional[str] = None
    note: Optional[str] = None
    category: Optional[str] = None

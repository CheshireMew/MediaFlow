from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl, RootModel

from backend.contracts import pipeline_step_param_model_names
from backend.models.editor_contracts import ClipExportRequest
from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.transcription_contracts import (
    TranscriptionOptions,
)
from backend.models.translation_contracts import TranslationOptions
from backend.models.synthesis_contracts import SynthesisInputs


class DownloadParams(BaseModel):
    url: HttpUrl
    format: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4"
    proxy: str | None = None
    output_dir: str | None = None
    playlist_title: str | None = None
    playlist_items: str | None = None
    download_subs: bool = False
    resolution: str = "best"
    cookie_file: str | None = None
    output_filename: str | None = None
    filename: str | None = None
    codec: str = "best"
    media_kind: Literal["video", "audio"] = "video"
    suggested_filename: str | None = None


class TranscribeParams(TranscriptionOptions):
    audio_ref: MediaReference | None = None


class TranslateParams(TranslationOptions):
    segments: list[SubtitleSegment] | None = None


class SynthesizeParams(SynthesisInputs):
    video_ref: MediaReference | None = None


_PARAM_MODELS_BY_NAME: dict[str, type[BaseModel]] = {
    model.__name__: model
    for model in (
        DownloadParams,
        TranscribeParams,
        TranslateParams,
        SynthesizeParams,
        ClipExportRequest,
    )
}
PIPELINE_STEP_PARAM_MODELS: dict[str, type[BaseModel]] = {
    step_name: _PARAM_MODELS_BY_NAME[model_name]
    for step_name, model_name in pipeline_step_param_model_names().items()
}

PipelineStepParams = (
    DownloadParams
    | TranscribeParams
    | TranslateParams
    | SynthesizeParams
    | ClipExportRequest
)


class DownloadStepRequest(BaseModel):
    step_name: Literal["download"]
    params: DownloadParams


class TranscribeStepRequest(BaseModel):
    step_name: Literal["transcribe"]
    params: TranscribeParams


class TranslateStepRequest(BaseModel):
    step_name: Literal["translate"]
    params: TranslateParams


class SynthesizeStepRequest(BaseModel):
    step_name: Literal["synthesize"]
    params: SynthesizeParams


class ClipExportStepRequest(BaseModel):
    step_name: Literal["clip_export"]
    params: ClipExportRequest


DiscriminatedPipelineStep = Annotated[
    DownloadStepRequest
    | TranscribeStepRequest
    | TranslateStepRequest
    | SynthesizeStepRequest
    | ClipExportStepRequest,
    Field(discriminator="step_name"),
]


class PipelineStepRequest(RootModel[DiscriminatedPipelineStep]):
    """Compatibility wrapper whose JSON shape is the discriminated step itself."""

    def __init__(self, root=None, **data):
        super().__init__(root=root if root is not None else data)

    @property
    def step_name(self) -> str:
        return self.root.step_name

    @property
    def params(self) -> PipelineStepParams:
        return self.root.params


class PipelineRequest(BaseModel):
    pipeline_id: str = "default_ingest_flow"
    task_name: str | None = None
    steps: list[PipelineStepRequest] = Field(min_length=1)

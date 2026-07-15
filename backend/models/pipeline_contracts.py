from pydantic import BaseModel, HttpUrl, model_validator

from backend.contracts import pipeline_step_names, pipeline_step_param_model_names
from backend.models.editor_contracts import ClipExportRequest
from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.transcription_contracts import (
    TranscriptionOptions,
)
from backend.models.translation_contracts import TranslationOptions
from backend.models.synthesis_contracts import SynthesisOptions


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


class TranscribeParams(TranscriptionOptions):
    audio_ref: MediaReference | None = None


class TranslateParams(TranslationOptions):
    segments: list[SubtitleSegment] | None = None


class SynthesizeParams(SynthesisOptions):
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


class PipelineStepRequest(BaseModel):
    step_name: str
    params: PipelineStepParams

    @model_validator(mode="before")
    @classmethod
    def validate_catalog_step(cls, value):
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
        return {**value, "params": param_model.model_validate(value["params"])}


class PipelineRequest(BaseModel):
    pipeline_id: str = "default_ingest_flow"
    task_name: str | None = None
    steps: list[PipelineStepRequest]

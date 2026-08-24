from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.models.task_result_contracts import (
    PipelineOutputs,
    TaskExecutionTraceItem,
)


class MediaReference(BaseModel):
    path: str
    name: str
    size: int | None = None
    type: str | None = None
    media_id: str | None = None
    media_kind: str | None = None
    role: str | None = None
    origin: str | None = None


class TaskArtifact(BaseModel):
    kind: Literal["video", "audio", "subtitle", "image", "file"]
    role: Literal["input", "output", "context"]
    ref: MediaReference
    producer_step: str | None = None


class TaskResult(BaseModel):
    """Canonical persisted and wire result for every task."""

    model_config = ConfigDict(extra="forbid")

    success: bool
    artifacts: list[TaskArtifact] = Field(default_factory=list)
    outputs: PipelineOutputs = Field(default_factory=PipelineOutputs)
    execution_trace: list[TaskExecutionTraceItem] = Field(default_factory=list)
    error: str | None = None

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

        def contains_media_key(value: Any) -> bool:
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
                    if contains_media_key(item):
                        return True
            elif isinstance(value, list):
                return any(contains_media_key(item) for item in value)
            return False

        if contains_media_key(self.outputs.model_dump(mode="json")):
            raise ValueError("TaskResult media references belong in artifacts, not outputs")
        return self

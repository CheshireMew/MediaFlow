import time
from typing import List, Literal

from backend.models.media_contracts import MediaReference, TaskArtifact
from backend.models.task_result_contracts import (
    ClipExportOutput,
    DownloadOutput,
    PipelineOutputs,
    SynthesisOutput,
    TaskExecutionTraceItem,
    TranscriptionOutput,
    TranslationOutput,
)


PipelineMediaKey = Literal["audio_ref", "video_ref", "subtitle_ref"]

class PipelineContext:
    """Shared state passed between pipeline steps."""

    def __init__(self):
        self.history: List[str] = []
        self.trace: List[TaskExecutionTraceItem] = []
        self.artifacts: List[TaskArtifact] = []
        self.outputs = PipelineOutputs()
        self.audio_ref: MediaReference | None = None
        self.video_ref: MediaReference | None = None
        self.subtitle_ref: MediaReference | None = None
        self._step_index = 0
        self._step_count = 1
        self._active_step_name: str | None = None

    def begin_step(self, step_name: str) -> None:
        if not step_name:
            raise ValueError("Pipeline step name is required")
        self._active_step_name = step_name

    def configure_step_progress(self, step_index: int, step_count: int) -> None:
        if step_count <= 0 or step_index < 0 or step_index >= step_count:
            raise ValueError("Pipeline step progress bounds are invalid")
        self._step_index = step_index
        self._step_count = step_count

    def project_step_progress(self, step_progress: float) -> float:
        bounded = max(0.0, min(100.0, float(step_progress)))
        return ((self._step_index + (bounded / 100.0)) / self._step_count) * 100.0

    def to_checkpoint(self, next_step_index: int) -> dict:
        return {
            "format": "mediaflow-pipeline-checkpoint-v2",
            "scope": "completed_steps",
            "resume_semantics": "restart_incomplete_step",
            "next_step_index": next_step_index,
            "history": list(self.history),
            "trace": [item.model_dump(mode="json") for item in self.trace],
            "artifacts": [item.model_dump(mode="json") for item in self.artifacts],
            "outputs": self.outputs.model_dump(mode="json"),
            "audio_ref": self.audio_ref.model_dump(mode="json") if self.audio_ref else None,
            "video_ref": self.video_ref.model_dump(mode="json") if self.video_ref else None,
            "subtitle_ref": self.subtitle_ref.model_dump(mode="json") if self.subtitle_ref else None,
        }

    @classmethod
    def from_checkpoint(cls, checkpoint: dict | None) -> tuple["PipelineContext", int]:
        ctx = cls()
        if checkpoint is None:
            return ctx, 0
        checkpoint_format = checkpoint.get("format")
        if checkpoint_format not in {
            "mediaflow-pipeline-checkpoint-v1",
            "mediaflow-pipeline-checkpoint-v2",
        }:
            raise ValueError("Unsupported pipeline checkpoint format")
        if checkpoint_format == "mediaflow-pipeline-checkpoint-v1":
            # V1 artifacts did not record their producing step. Restoring them
            # would make final output validation ambiguous, so replay safely.
            return ctx, 0
        if checkpoint_format == "mediaflow-pipeline-checkpoint-v2" and (
            checkpoint.get("scope") != "completed_steps"
            or checkpoint.get("resume_semantics") != "restart_incomplete_step"
        ):
            raise ValueError("Pipeline checkpoint has invalid resume semantics")
        next_step_index = checkpoint.get("next_step_index")
        if not isinstance(next_step_index, int) or next_step_index < 0:
            raise ValueError("Pipeline checkpoint has an invalid next step index")
        history = checkpoint.get("history")
        if not isinstance(history, list) or not all(isinstance(item, str) for item in history):
            raise ValueError("Pipeline checkpoint history is invalid")
        ctx.history = list(history)
        ctx.trace = [
            TaskExecutionTraceItem.model_validate(item)
            for item in checkpoint.get("trace") or []
        ]
        ctx.artifacts = [
            TaskArtifact.model_validate(item)
            for item in checkpoint.get("artifacts") or []
        ]
        ctx.outputs = PipelineOutputs.model_validate(checkpoint.get("outputs") or {})
        for key in ("audio_ref", "video_ref", "subtitle_ref"):
            raw_ref = checkpoint.get(key)
            if raw_ref is not None:
                setattr(ctx, key, MediaReference.model_validate(raw_ref))
        return ctx, next_step_index

    def publish_download(self, output: DownloadOutput) -> None:
        self.outputs.download = output

    def publish_transcription(self, output: TranscriptionOutput) -> None:
        self.outputs.transcription = output

    def publish_translation(self, output: TranslationOutput) -> None:
        self.outputs.translation = output

    def publish_synthesis(self, output: SynthesisOutput) -> None:
        self.outputs.synthesis = output

    def publish_clip_export(self, output: ClipExportOutput) -> None:
        self.outputs.clip_export = output

    def require_step_outputs(self, step_names: list[str]) -> None:
        output_fields = {
            "download": "download",
            "transcribe": "transcription",
            "translate": "translation",
            "synthesize": "synthesis",
            "clip_export": "clip_export",
        }
        missing = [
            step_name
            for step_name in step_names
            if getattr(self.outputs, output_fields[step_name]) is None
        ]
        if missing:
            raise RuntimeError(
                "Pipeline completed without required typed outputs: "
                + ", ".join(missing)
            )

        output_artifacts = [
            artifact for artifact in self.artifacts if artifact.role == "output"
        ]
        artifact_requirements = {
            "download": {"video", "audio"},
            "transcribe": {"subtitle"},
            "translate": {"subtitle"},
            "synthesize": {"video"},
            "clip_export": {"video"},
        }
        invalid_artifacts = [
            step_name
            for step_name in step_names
            if not any(
                artifact.kind in artifact_requirements[step_name]
                and artifact.producer_step == step_name
                for artifact in output_artifacts
            )
        ]
        if invalid_artifacts:
            raise RuntimeError(
                "Pipeline completed without required output artifacts: "
                + ", ".join(invalid_artifacts)
            )

        if (
            "translate" in step_names
            and self.outputs.translation is not None
            and not self.outputs.translation.segments
        ):
            raise RuntimeError("Translation completed without translated segments")

        if (
            "clip_export" in step_names
            and self.outputs.clip_export is not None
            and self.outputs.clip_export.count <= 0
        ):
            raise RuntimeError("Clip export completed without exported clips")

    def set_media(
        self,
        key: PipelineMediaKey,
        ref: MediaReference,
        *,
        kind: Literal["video", "audio", "subtitle", "image", "file"],
        role: Literal["input", "output", "context"] = "output",
        track_artifact: bool = True,
    ) -> MediaReference:
        if key not in {"audio_ref", "video_ref", "subtitle_ref"}:
            raise ValueError(f"Unsupported pipeline media key: {key}")
        if not isinstance(ref, MediaReference):
            raise TypeError("Pipeline media values must be MediaReference instances")
        media_ref = ref
        media_ref = media_ref.model_copy(update={"role": role})
        setattr(self, key, media_ref)
        if not track_artifact:
            return media_ref
        artifact = TaskArtifact(
            kind=kind,
            role=role,
            ref=media_ref,
            producer_step=self._active_step_name if role == "output" else None,
        )
        self.add_artifact(artifact)
        return media_ref

    def add_artifact(self, artifact: TaskArtifact) -> None:
        if artifact.role == "output" and artifact.producer_step is None:
            if self._active_step_name is None:
                raise RuntimeError("Output artifacts must be added while a pipeline step is active")
            artifact = artifact.model_copy(
                update={"producer_step": self._active_step_name}
            )
        dedupe_key = (
            artifact.kind,
            artifact.role,
            artifact.ref.path,
            artifact.producer_step,
        )
        if not any(
            (item.kind, item.role, item.ref.path, item.producer_step) == dedupe_key
            for item in self.artifacts
        ):
            self.artifacts.append(artifact)

    def get_media(self, *keys: PipelineMediaKey) -> MediaReference | None:
        for key in keys:
            if key not in {"audio_ref", "video_ref", "subtitle_ref"}:
                raise ValueError(f"Unsupported pipeline media key: {key}")
            value = getattr(self, key)
            if isinstance(value, MediaReference):
                return value
        return None

    def add_trace(
        self,
        step_name: str,
        duration: float,
        status: Literal["success", "failed"],
        error: str | None = None,
    ) -> None:
        self.trace.append(
            TaskExecutionTraceItem(
                step=step_name,
                duration=round(duration, 3),
                status=status,
                error=error,
                timestamp=time.time(),
            )
        )

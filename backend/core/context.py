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
        artifact = TaskArtifact(kind=kind, role=role, ref=media_ref)
        self.add_artifact(artifact)
        return media_ref

    def add_artifact(self, artifact: TaskArtifact) -> None:
        dedupe_key = (artifact.kind, artifact.role, artifact.ref.path)
        if not any(
            (item.kind, item.role, item.ref.path) == dedupe_key
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

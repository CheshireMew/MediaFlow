import time
from typing import Any, Dict, List, Literal

from backend.models.schemas import MediaReference, TaskArtifact

class PipelineContext:
    """Shared state passed between pipeline steps."""
    def __init__(self):
        self.data: Dict[str, Any] = {}
        self.history: List[str] = []
        self.trace: List[Dict[str, Any]] = []
        self.artifacts: List[TaskArtifact] = []

    def set(self, key: str, value: Any):
        if key.endswith("_path"):
            raise ValueError("PipelineContext does not store media paths; use a MediaReference")
        if key.endswith("_ref"):
            raise ValueError("Pipeline media references must be stored with set_media()")
        self.data[key] = value

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def set_media(
        self,
        key: str,
        ref: MediaReference,
        *,
        kind: Literal["video", "audio", "subtitle", "image", "file"],
        role: Literal["input", "output", "context"] = "output",
        track_artifact: bool = True,
    ) -> MediaReference:
        if not key.endswith("_ref"):
            raise ValueError("Pipeline media keys must end with '_ref'")
        if not isinstance(ref, MediaReference):
            raise TypeError("Pipeline media values must be MediaReference instances")
        media_ref = ref
        media_ref = media_ref.model_copy(update={"role": role})
        self.data[key] = media_ref
        if not track_artifact:
            return media_ref
        artifact = TaskArtifact(kind=kind, role=role, ref=media_ref)
        dedupe_key = (artifact.kind, artifact.role, artifact.ref.path)
        if not any(
            (item.kind, item.role, item.ref.path) == dedupe_key
            for item in self.artifacts
        ):
            self.artifacts.append(artifact)
        return media_ref

    def get_media(self, *keys: str) -> MediaReference | None:
        for key in keys:
            value = self.get(key)
            if isinstance(value, MediaReference):
                return value
            if value is not None:
                raise TypeError(f"Pipeline context key '{key}' is not a MediaReference")
        return None

    def add_trace(self, step_name: str, duration: float, status: str, error: str = None):
        self.trace.append({
            "step": step_name,
            "duration": round(duration, 3),
            "status": status,
            "error": error,
            "timestamp": time.time()
        })

from __future__ import annotations

from typing import Any

from backend.contracts import pipeline_step_operation
from backend.models.media_contracts import MediaReference, TaskArtifact
from backend.services.media_extensions import media_kind_from_extension


REF_KEY_ROLES: dict[str, str] = {
    "audio_ref": "input",
    "video_ref": "input",
    "subtitle_ref": "input",
    "srt_ref": "input",
    "context_ref": "context",
    "output_ref": "output",
}

def primary_operation(task_type: str, request_params: dict[str, Any] | None) -> str:
    if task_type != "pipeline":
        return task_type

    steps = request_params.get("steps") if isinstance(request_params, dict) else None
    if not isinstance(steps, list) or not steps:
        return task_type

    first_step = steps[0]
    if not isinstance(first_step, dict):
        return task_type

    step_name = first_step.get("step_name")
    if not isinstance(step_name, str):
        return task_type

    try:
        return pipeline_step_operation(step_name)
    except Exception:
        return task_type


def _media_kind_from_ref(ref: MediaReference, fallback_key: str | None = None) -> str:
    media_kind = (ref.media_kind or "").lower()
    if media_kind in {"video", "audio", "subtitle", "image"}:
        return media_kind

    mime_type = (ref.type or "").lower()
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    if "subrip" in mime_type or "subtitle" in mime_type:
        return "subtitle"
    if mime_type.startswith("image/"):
        return "image"

    media_kind_from_path = media_kind_from_extension(ref.path)
    if media_kind_from_path:
        return media_kind_from_path

    if fallback_key:
        if "audio" in fallback_key:
            return "audio"
        if "subtitle" in fallback_key or fallback_key == "srt_ref":
            return "subtitle"
        if "video" in fallback_key:
            return "video"

    return "file"


def _media_ref(value: Any) -> MediaReference | None:
    if isinstance(value, MediaReference):
        return value
    if isinstance(value, dict):
        try:
            return MediaReference.model_validate(value)
        except Exception:
            return None
    return None


def _append_ref_artifact(
    artifacts: list[TaskArtifact],
    seen: set[tuple[str, str, str]],
    *,
    key: str,
    value: Any,
    default_role: str,
) -> None:
    ref = _media_ref(value)
    if ref is None:
        return

    kind = _media_kind_from_ref(ref, key)
    role = default_role
    ref = ref.model_copy(update={"role": role})
    dedupe_key = (kind, role, ref.path)
    if dedupe_key in seen:
        return
    seen.add(dedupe_key)
    artifacts.append(TaskArtifact(kind=kind, role=role, ref=ref))


def _walk_request_refs(payload: Any, artifacts: list[TaskArtifact], seen: set[tuple[str, str, str]]) -> None:
    if isinstance(payload, list):
        for item in payload:
            _walk_request_refs(item, artifacts, seen)
        return

    if not isinstance(payload, dict):
        return

    for key, value in payload.items():
        if key in REF_KEY_ROLES:
            _append_ref_artifact(
                artifacts,
                seen,
                key=key,
                value=value,
                default_role=REF_KEY_ROLES[key],
            )
        elif isinstance(value, (dict, list)):
            _walk_request_refs(value, artifacts, seen)


def _walk_result_refs(payload: Any, artifacts: list[TaskArtifact], seen: set[tuple[str, str, str]]) -> None:
    if not isinstance(payload, dict):
        return

    result_artifacts = payload.get("artifacts")
    if not isinstance(result_artifacts, list):
        return
    for value in result_artifacts:
        try:
            artifact = TaskArtifact.model_validate(value)
        except Exception:
            continue
        dedupe_key = (artifact.kind, artifact.role, artifact.ref.path)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        artifacts.append(artifact)


def task_artifacts(
    *,
    request_params: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> list[TaskArtifact]:
    artifacts: list[TaskArtifact] = []
    seen: set[tuple[str, str, str]] = set()
    _walk_request_refs(request_params, artifacts, seen)
    _walk_result_refs(result, artifacts, seen)
    return artifacts

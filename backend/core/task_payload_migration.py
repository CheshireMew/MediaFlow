from __future__ import annotations

from copy import deepcopy
from typing import Any

from backend.models.schemas import MediaReference, TaskArtifact, TaskResult
from backend.services.media_extensions import media_kind_from_extension


_MEDIA_KINDS = {"video", "audio", "subtitle", "image", "file"}
_SUBTITLE_ALIASES = {"srt", "vtt", "ass", "ssa", "subtitle"}
_OUTPUT_PATH_KEYS = {
    "video_path": "video",
    "audio_path": "audio",
    "subtitle_path": "subtitle",
    "srt_path": "subtitle",
    "image_path": "image",
    "png_path": "image",
    "json_path": "file",
    "output_path": None,
    "media_path": None,
}
_INPUT_PATH_KEYS = {
    "input_path",
    "source_path",
    "original_path",
    "context_path",
    "watermark_path",
}
_REQUEST_REF_KEYS = {
    "audio_ref",
    "video_ref",
    "subtitle_ref",
    "srt_ref",
    "context_ref",
    "output_ref",
    "watermark_ref",
    "input_ref",
    "source_ref",
    "original_ref",
    "media_ref",
}
_RESULT_KEYS = {"success", "artifacts", "files", "meta", "error"}


def _basename(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def _kind_from_hint(path: str, key_hint: str = "", value: Any = None) -> str:
    if isinstance(value, dict):
        media_kind = str(value.get("media_kind") or "").lower()
        if media_kind in _MEDIA_KINDS:
            return media_kind
        legacy_type = str(value.get("type") or "").lower()
        if legacy_type in _MEDIA_KINDS:
            return legacy_type
        if legacy_type in _SUBTITLE_ALIASES:
            return "subtitle"

        mime_type = str(value.get("mime_type") or value.get("type") or "").lower()
        if mime_type.startswith("video/"):
            return "video"
        if mime_type.startswith("audio/"):
            return "audio"
        if mime_type.startswith("image/"):
            return "image"
        if "subtitle" in mime_type or "subrip" in mime_type:
            return "subtitle"

    extension_kind = media_kind_from_extension(path)
    if extension_kind:
        return extension_kind

    lowered_key = key_hint.lower()
    if "subtitle" in lowered_key or "srt" in lowered_key:
        return "subtitle"
    if "video" in lowered_key:
        return "video"
    if "audio" in lowered_key:
        return "audio"
    if "image" in lowered_key or "png" in lowered_key or "watermark" in lowered_key:
        return "image"
    return "file"


def _canonical_ref(
    value: Any,
    *,
    key_hint: str,
    role: str | None,
) -> tuple[dict[str, Any], str] | None:
    if isinstance(value, str):
        path = value.strip()
        source: dict[str, Any] = {}
    elif isinstance(value, dict):
        raw_path = value.get("path")
        if not isinstance(raw_path, str):
            return None
        path = raw_path.strip()
        source = value
    else:
        return None

    if not path:
        return None

    kind = _kind_from_hint(path, key_hint, source)
    mime_type = source.get("mime_type") or source.get("type")
    if isinstance(mime_type, str) and mime_type.lower() in _MEDIA_KINDS | _SUBTITLE_ALIASES:
        mime_type = None

    source_role = source.get("role")
    resolved_role = (
        role
        if role is not None
        else source_role
        if source_role in {"input", "output", "context"}
        else None
    )
    ref = MediaReference(
        path=path,
        name=(
            source.get("name")
            if isinstance(source.get("name"), str) and source.get("name")
            else _basename(path)
        ),
        size=source.get("size") if isinstance(source.get("size"), int) else None,
        type=mime_type if isinstance(mime_type, str) else None,
        media_id=(
            source.get("media_id")
            if isinstance(source.get("media_id"), str)
            else None
        ),
        media_kind=kind,
        role=resolved_role,
        origin=(
            source.get("origin")
            if isinstance(source.get("origin"), str) and source.get("origin")
            else "task"
        ),
    )
    return ref.model_dump(mode="json"), kind


def _request_target(operation: str, source_key: str, kind: str) -> str | None:
    if operation in {"transcribe", "transcribe_segment"}:
        return "audio_ref" if kind in {"audio", "video"} else None
    if operation == "translate":
        return "context_ref" if kind in {"video", "audio", "subtitle"} else None
    if operation in {"synthesis", "synthesize", "clip_export"}:
        if source_key in {"watermark_path", "watermark_ref"}:
            return "watermark_ref"
        if source_key == "output_path" or source_key == "output_ref":
            return "output_ref"
        if kind == "subtitle":
            return "srt_ref"
        if kind in {"video", "audio"}:
            return "video_ref"
        return None
    return None


def _request_role(ref_key: str) -> str:
    if ref_key == "output_ref":
        return "output"
    if ref_key == "context_ref":
        return "context"
    return "input"


def _store_ref(payload: dict[str, Any], target: str, ref: dict[str, Any]) -> bool:
    existing = payload.get(target)
    if existing is not None:
        canonical = _canonical_ref(
            existing,
            key_hint=target,
            role=_request_role(target),
        )
        if canonical is not None:
            payload[target] = canonical[0]
            return False
    canonical = _canonical_ref(
        ref,
        key_hint=target,
        role=_request_role(target),
    )
    if canonical is None:
        return False
    payload[target] = canonical[0]
    return True


def _normalize_operation_request(payload: dict[str, Any], operation: str) -> None:
    if operation == "translate" and payload.get("target_language") == "Chinese":
        payload["target_language"] = "SimplifiedChinese"

    for ref_key in list(_REQUEST_REF_KEYS):
        if ref_key not in payload:
            continue
        value = payload.get(ref_key)
        canonical = _canonical_ref(
            value,
            key_hint=ref_key,
            role=_request_role(ref_key),
        )
        if canonical is None:
            payload.pop(ref_key, None)
            continue
        target = _request_target(operation, ref_key, canonical[1]) or ref_key
        if target != ref_key:
            payload.pop(ref_key, None)
        _store_ref(payload, target, canonical[0])

    legacy_path_keys = {
        "audio_path",
        "video_path",
        "subtitle_path",
        "srt_path",
        "context_path",
        "output_path",
        "watermark_path",
        "input_path",
        "source_path",
        "original_path",
        "media_path",
    }
    for path_key in legacy_path_keys:
        if path_key not in payload:
            continue
        raw_path = payload.pop(path_key)
        canonical = _canonical_ref(raw_path, key_hint=path_key, role="input")
        if canonical is None:
            continue
        target = _request_target(operation, path_key, canonical[1])
        if target:
            _store_ref(payload, target, canonical[0])


def _pipeline_steps(request: dict[str, Any]) -> list[dict[str, Any]]:
    steps = request.get("steps")
    if not isinstance(steps, list):
        return []
    return [step for step in steps if isinstance(step, dict)]


def _store_pipeline_ref(
    request: dict[str, Any],
    ref: dict[str, Any],
    *,
    semantic_key: str,
    kind: str,
) -> bool:
    stored = False
    for step in _pipeline_steps(request):
        step_name = str(step.get("step_name") or "")
        params = step.get("params")
        if not isinstance(params, dict):
            params = {}
            step["params"] = params

        target: str | None = None
        if step_name == "transcribe" and kind in {"audio", "video"}:
            target = "audio_ref"
        elif step_name == "translate" and kind in {"video", "audio", "subtitle"}:
            target = "context_ref"
        elif step_name == "synthesize":
            if semantic_key in {"watermark_ref", "watermark_path"}:
                target = "watermark_ref"
            elif semantic_key in {"output_ref", "output_path"}:
                target = "output_ref"
            elif kind == "subtitle":
                target = "srt_ref"
            elif kind in {"video", "audio"}:
                target = "video_ref"

        if target:
            stored = _store_ref(params, target, ref) or stored
    return stored


def normalize_task_request_v2(
    task_type: str,
    request_params: Any,
) -> dict[str, Any] | None:
    if request_params is None:
        return None
    if not isinstance(request_params, dict):
        return {"legacy_payload": deepcopy(request_params)}

    request = deepcopy(request_params)
    steps = _pipeline_steps(request)
    if steps:
        for step in steps:
            params = step.get("params")
            if not isinstance(params, dict):
                params = {}
                step["params"] = params
            _normalize_operation_request(params, str(step.get("step_name") or ""))

        for key in list(_REQUEST_REF_KEYS):
            if key not in request:
                continue
            canonical = _canonical_ref(
                request.pop(key),
                key_hint=key,
                role=_request_role(key),
            )
            if canonical:
                _store_pipeline_ref(
                    request,
                    canonical[0],
                    semantic_key=key,
                    kind=canonical[1],
                )

        for key in {
            "audio_path",
            "video_path",
            "subtitle_path",
            "srt_path",
            "context_path",
            "output_path",
            "watermark_path",
            "input_path",
            "source_path",
            "original_path",
            "media_path",
        }:
            if key not in request:
                continue
            canonical = _canonical_ref(request.pop(key), key_hint=key, role="input")
            if canonical:
                _store_pipeline_ref(
                    request,
                    canonical[0],
                    semantic_key=key,
                    kind=canonical[1],
                )
        return request

    _normalize_operation_request(request, task_type)
    return request


def _put_request_media(
    request: dict[str, Any],
    task_type: str,
    ref: dict[str, Any],
    *,
    semantic_key: str,
    kind: str,
) -> None:
    if _pipeline_steps(request):
        _store_pipeline_ref(
            request,
            ref,
            semantic_key=semantic_key,
            kind=kind,
        )
        return
    target = _request_target(task_type, semantic_key, kind)
    if target:
        _store_ref(request, target, ref)


def _artifact_from_value(
    value: Any,
    *,
    key_hint: str,
) -> dict[str, Any] | None:
    canonical = _canonical_ref(value, key_hint=key_hint, role="output")
    if canonical is None:
        return None
    ref, kind = canonical
    return TaskArtifact(kind=kind, role="output", ref=ref).model_dump(mode="json")


def _merge_artifact(
    artifacts_by_path: dict[str, tuple[int, dict[str, Any]]],
    artifact: dict[str, Any] | None,
    *,
    priority: int,
) -> None:
    if artifact is None:
        return
    path = artifact["ref"]["path"]
    current = artifacts_by_path.get(path)
    if current is None:
        artifacts_by_path[path] = (priority, artifact)
        return

    current_priority, current_artifact = current
    if priority < current_priority:
        preferred, fallback = current_artifact, artifact
        preferred_priority = current_priority
    else:
        preferred, fallback = artifact, current_artifact
        preferred_priority = priority

    preferred_ref = preferred["ref"]
    fallback_ref = fallback["ref"]
    for key in ("name", "size", "type", "media_id", "media_kind", "origin"):
        if preferred_ref.get(key) is None:
            preferred_ref[key] = fallback_ref.get(key)
    if preferred["kind"] == "file" and fallback["kind"] != "file":
        preferred["kind"] = fallback["kind"]
        preferred_ref["media_kind"] = fallback["kind"]
    artifacts_by_path[path] = (preferred_priority, preferred)


def _is_result_output(
    task_type: str,
    key: str,
    ref: dict[str, Any],
    output_paths: set[str],
) -> bool:
    path = ref["path"]
    lowered = key.lower()
    if path in output_paths or lowered.startswith("output_"):
        return True
    if lowered in {"context_ref", "original_ref", "source_ref", "input_ref"}:
        return False

    role = str(ref.get("role") or "").lower()
    if role == "output":
        return True
    if role in {"input", "context"}:
        return False

    if task_type in {"download"}:
        return True
    if task_type in {"transcribe", "transcribe_segment", "translate"}:
        return "subtitle" in lowered or "srt" in lowered
    if task_type == "synthesis":
        return "video" in lowered
    if task_type == "pipeline":
        return False
    return False


def _extract_ref_value(
    *,
    value: Any,
    key: str,
    task_type: str,
    request: dict[str, Any],
    artifacts_by_path: dict[str, tuple[int, dict[str, Any]]],
) -> None:
    values = value if isinstance(value, list) else [value]
    for item in values:
        canonical = _canonical_ref(item, key_hint=key, role=None)
        if canonical is None:
            continue
        ref, kind = canonical
        output_paths = set(artifacts_by_path)
        if _is_result_output(task_type, key, ref, output_paths):
            ref["role"] = "output"
            _merge_artifact(
                artifacts_by_path,
                TaskArtifact(kind=kind, role="output", ref=ref).model_dump(mode="json"),
                priority=20,
            )
        else:
            request_ref = dict(ref)
            request_ref["role"] = "context" if key == "context_ref" else "input"
            _put_request_media(
                request,
                task_type,
                request_ref,
                semantic_key=key,
                kind=kind,
            )


def _extract_download_artifacts(
    meta: dict[str, Any],
    artifacts_by_path: dict[str, tuple[int, dict[str, Any]]],
) -> None:
    raw = meta.pop("download_artifacts", None)
    if not isinstance(raw, dict):
        return

    for key in ("primary", "subtitle"):
        _merge_artifact(
            artifacts_by_path,
            _artifact_from_value(raw.get(key), key_hint=key),
            priority=15,
        )

    warnings = raw.get("warnings")
    if isinstance(warnings, list) and warnings:
        existing = meta.get("warnings")
        merged = list(existing) if isinstance(existing, list) else []
        for warning in warnings:
            if warning not in merged:
                merged.append(warning)
        meta["warnings"] = merged

    recovery = raw.get("recovery")
    if isinstance(recovery, list):
        strategies = [
            item.get("strategy")
            for item in recovery
            if isinstance(item, dict) and isinstance(item.get("strategy"), str)
        ]
        if strategies:
            meta["recovery_strategies"] = strategies

    remaining = {
        key: value
        for key, value in raw.items()
        if key not in {"primary", "subtitle", "warnings", "recovery"}
    }
    if remaining:
        meta["download_details"] = remaining


def _clean_result_meta(
    value: Any,
    *,
    task_type: str,
    request: dict[str, Any],
    artifacts_by_path: dict[str, tuple[int, dict[str, Any]]],
    parent_key: str = "",
) -> Any:
    if isinstance(value, list):
        return [
            _clean_result_meta(
                item,
                task_type=task_type,
                request=request,
                artifacts_by_path=artifacts_by_path,
                parent_key=parent_key,
            )
            for item in value
        ]
    if not isinstance(value, dict):
        return value

    cleaned: dict[str, Any] = {}
    for key, item in value.items():
        lowered = key.lower()
        if lowered.endswith("_ref") or lowered.endswith("_refs"):
            _extract_ref_value(
                value=item,
                key=lowered,
                task_type=task_type,
                request=request,
                artifacts_by_path=artifacts_by_path,
            )
            continue

        singular_path_key = (
            lowered.removesuffix("s") if lowered.endswith("_paths") else lowered
        )
        if singular_path_key in _OUTPUT_PATH_KEYS:
            values = item if isinstance(item, list) else [item]
            for path_value in values:
                _merge_artifact(
                    artifacts_by_path,
                    _artifact_from_value(path_value, key_hint=singular_path_key),
                    priority=12,
                )
            continue

        if singular_path_key in _INPUT_PATH_KEYS:
            values = item if isinstance(item, list) else [item]
            for path_value in values:
                canonical = _canonical_ref(
                    path_value,
                    key_hint=singular_path_key,
                    role="input",
                )
                if canonical:
                    _put_request_media(
                        request,
                        task_type,
                        canonical[0],
                        semantic_key=singular_path_key,
                        kind=canonical[1],
                    )
            continue

        if lowered == "path" and isinstance(item, str):
            if parent_key not in {"recovery", "recovery_strategies"}:
                kind = media_kind_from_extension(item)
                if kind:
                    _merge_artifact(
                        artifacts_by_path,
                        _artifact_from_value(item, key_hint=parent_key),
                        priority=12,
                    )
                    continue

        cleaned[key] = _clean_result_meta(
            item,
            task_type=task_type,
            request=request,
            artifacts_by_path=artifacts_by_path,
            parent_key=lowered,
        )
    return cleaned


def normalize_task_result_v2(
    *,
    task_type: str,
    status: str,
    request: dict[str, Any],
    result: Any,
    task_error: str | None,
) -> dict[str, Any] | None:
    if result is None:
        return None

    raw = deepcopy(result)
    if not isinstance(raw, dict):
        raw = {"legacy_result": raw}

    artifacts_by_path: dict[str, tuple[int, dict[str, Any]]] = {}

    existing_artifacts = raw.get("artifacts")
    if isinstance(existing_artifacts, list):
        for value in existing_artifacts:
            if not isinstance(value, dict):
                continue
            ref_value = value.get("ref")
            key_hint = str(value.get("kind") or "artifact")
            _merge_artifact(
                artifacts_by_path,
                _artifact_from_value(ref_value, key_hint=key_hint),
                priority=30,
            )

    legacy_files = raw.get("files")
    if isinstance(legacy_files, list):
        for file_value in legacy_files:
            _merge_artifact(
                artifacts_by_path,
                _artifact_from_value(file_value, key_hint="files"),
                priority=10,
            )

    raw_meta = raw.get("meta")
    meta = deepcopy(raw_meta) if isinstance(raw_meta, dict) else {}
    for key, value in raw.items():
        if key not in _RESULT_KEYS:
            meta.setdefault(key, deepcopy(value))

    _extract_download_artifacts(meta, artifacts_by_path)
    meta = _clean_result_meta(
        meta,
        task_type=task_type,
        request=request,
        artifacts_by_path=artifacts_by_path,
    )

    success_value = raw.get("success")
    success = success_value if isinstance(success_value, bool) else status == "completed"
    error_value = raw.get("error")
    error = error_value if isinstance(error_value, str) else task_error
    task_result = TaskResult(
        success=success,
        artifacts=[artifact for _, artifact in artifacts_by_path.values()],
        meta=meta,
        error=error,
    )
    return task_result.model_dump(mode="json")


def migrate_task_payload_v1_to_v2(
    *,
    task_type: str,
    status: str,
    request_params: Any,
    result: Any,
    task_error: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    request = normalize_task_request_v2(task_type, request_params)
    mutable_request = request if request is not None else {}
    migrated_result = normalize_task_result_v2(
        task_type=task_type,
        status=status,
        request=mutable_request,
        result=result,
        task_error=task_error,
    )
    if request is None and mutable_request:
        request = mutable_request
    return request, migrated_result

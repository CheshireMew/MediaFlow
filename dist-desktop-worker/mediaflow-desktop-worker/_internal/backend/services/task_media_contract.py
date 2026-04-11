from __future__ import annotations

from typing import Any, Optional

from backend.services.media_refs import create_media_ref


def _media_ref(file_path: Optional[str], media_type: Optional[str] = None) -> Optional[dict]:
    return create_media_ref(file_path, media_type)


def _resolve_request_video_path(task_type: Any, request_params: dict[str, Any]) -> Optional[str]:
    if task_type == "transcribe":
        return request_params.get("audio_path")
    if task_type in {"extract", "enhancement", "cleanup", "synthesis"}:
        return request_params.get("video_path")
    if task_type != "pipeline":
        return None

    steps = request_params.get("steps")
    if not isinstance(steps, list):
        return None

    transcribe_step = next(
        (
            step
            for step in steps
            if isinstance(step, dict) and step.get("step_name") == "transcribe"
        ),
        None,
    )
    if not isinstance(transcribe_step, dict):
        return None

    params = transcribe_step.get("params")
    if not isinstance(params, dict):
        return None
    return params.get("audio_path")


def _resolve_request_subtitle_path(request_params: dict[str, Any]) -> Optional[str]:
    return request_params.get("srt_path") or request_params.get("context_path")


def _resolve_result_video_path(result: dict[str, Any]) -> Optional[str]:
    return next(
        (
            file_ref.get("path")
            for file_ref in result.get("files", [])
            if isinstance(file_ref, dict)
            and file_ref.get("type") in {"video", "audio"}
            and isinstance(file_ref.get("path"), str)
        ),
        None,
    )


def _resolve_result_subtitle_path(result: dict[str, Any], meta: dict[str, Any]) -> Optional[str]:
    return meta.get("srt_path") or next(
        (
            file_ref.get("path")
            for file_ref in result.get("files", [])
            if isinstance(file_ref, dict)
            and file_ref.get("type") == "subtitle"
            and isinstance(file_ref.get("path"), str)
        ),
        None,
    )


def normalize_task_media_contract(data: dict[str, Any]) -> bool:
    normalized_from_legacy = False
    request_params = data.get("request_params")
    if isinstance(request_params, dict):
        request_video_path = _resolve_request_video_path(data.get("type"), request_params)
        request_subtitle_path = _resolve_request_subtitle_path(request_params)
        has_request_structured_subtitle_ref = bool(
            request_params.get("context_ref") or request_params.get("subtitle_ref")
        )
        request_params.setdefault("video_ref", None)
        request_params.setdefault("context_ref", None)
        request_params.setdefault("subtitle_ref", None)

        if request_params.get("video_ref") is None and request_video_path:
            request_params["video_ref"] = _media_ref(request_video_path, "video/mp4")
            normalized_from_legacy = True
        if request_subtitle_path and not has_request_structured_subtitle_ref:
            if request_params.get("context_ref") is None:
                request_params["context_ref"] = _media_ref(
                    request_subtitle_path,
                    "application/x-subrip",
                )
                normalized_from_legacy = True
            if request_params.get("subtitle_ref") is None:
                request_params["subtitle_ref"] = _media_ref(
                    request_subtitle_path,
                    "application/x-subrip",
                )
                normalized_from_legacy = True

    result = data.get("result")
    if not isinstance(result, dict):
        return normalized_from_legacy

    meta = result.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        result["meta"] = meta

    result_video_path = _resolve_result_video_path(result)
    result_subtitle_path = _resolve_result_subtitle_path(result, meta)
    has_result_structured_subtitle_ref = bool(
        meta.get("context_ref") or meta.get("subtitle_ref") or meta.get("output_ref")
    )
    meta.setdefault("video_ref", None)
    meta.setdefault("context_ref", None)
    meta.setdefault("subtitle_ref", None)
    meta.setdefault("output_ref", None)

    if meta.get("video_ref") is None and result_video_path:
        meta["video_ref"] = _media_ref(result_video_path, "video/mp4")
        normalized_from_legacy = True
    if result_subtitle_path and not has_result_structured_subtitle_ref:
        if meta.get("context_ref") is None:
            meta["context_ref"] = _media_ref(result_subtitle_path, "application/x-subrip")
            normalized_from_legacy = True
        if meta.get("subtitle_ref") is None:
            meta["subtitle_ref"] = _media_ref(result_subtitle_path, "application/x-subrip")
            normalized_from_legacy = True

    output_path = result_video_path or result_subtitle_path
    if meta.get("output_ref") is None and output_path and not has_result_structured_subtitle_ref:
        meta["output_ref"] = _media_ref(
            output_path,
            "video/mp4" if result_video_path else "application/x-subrip",
        )
        normalized_from_legacy = True

    return normalized_from_legacy

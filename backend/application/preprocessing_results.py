from pathlib import Path

from backend.models.schemas import CleanRequest, EnhanceRequest, FileRef, TaskResult
from backend.services.media_refs import create_media_ref


def resolve_enhancement_scale(request: EnhanceRequest) -> int:
    try:
        return int(request.scale.lower().replace("x", ""))
    except (AttributeError, ValueError):
        return 4


def resolve_enhancement_output_path(request: EnhanceRequest) -> Path:
    source = Path(request.video_path or "")
    scale_value = resolve_enhancement_scale(request)
    return source.parent / f"{source.stem}_{request.method}_{scale_value}x{source.suffix}"


def build_enhancement_result(request: EnhanceRequest, output_path: str) -> dict:
    scale_value = resolve_enhancement_scale(request)
    output_ref = create_media_ref(output_path, "video/mp4", role="output")
    return TaskResult(
        success=True,
        files=[FileRef(type="video", path=output_path, label="upscaled_video")],
        meta={
            "video_path": output_path,
            "original_path": request.video_path,
            "video_ref": output_ref,
            "output_ref": output_ref,
            "model": request.model,
            "scale": scale_value,
            "method": request.method,
        },
    ).model_dump(mode="json")


def resolve_cleanup_method(request: CleanRequest) -> str:
    return request.method or "telea"


def resolve_cleanup_output_path(request: CleanRequest) -> Path:
    source = Path(request.video_path or "")
    method = resolve_cleanup_method(request)
    return source.with_name(f"{source.stem}_cleaned_{method}{source.suffix}")


def build_cleanup_result(request: CleanRequest, output_path: str) -> dict:
    method = resolve_cleanup_method(request)
    output_ref = create_media_ref(output_path, "video/mp4", role="output")
    return TaskResult(
        success=True,
        files=[FileRef(type="video", path=output_path, label="cleaned")],
        meta={
            "video_path": output_path,
            "video_ref": output_ref,
            "output_ref": output_ref,
            "original_path": request.video_path,
            "method": method,
        },
    ).model_dump(mode="json")

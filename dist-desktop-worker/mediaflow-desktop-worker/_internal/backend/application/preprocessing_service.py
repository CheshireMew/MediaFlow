from pathlib import Path

from backend.core.runtime_access import RuntimeServices
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import (
    CleanRequest,
    EnhanceRequest,
    FileRef,
    PreprocessingResponse,
    TaskResult,
)
from backend.services.media_refs import create_media_ref


async def submit_enhancement_task(request: EnhanceRequest) -> dict:
    enhancer = RuntimeServices.enhancer()
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    source = Path(request.video_path or "")
    try:
        scale_value = int(request.scale.lower().replace("x", ""))
    except (AttributeError, ValueError):
        scale_value = 4
    output_path = source.parent / f"{source.stem}_{request.method}_{scale_value}x{source.suffix}"

    def transform_result(path: str):
        output_ref = create_media_ref(path, "video/mp4", role="output")
        return TaskResult(
            success=True,
            files=[FileRef(type="video", path=path, label="upscaled_video")],
            meta={
                "video_path": path,
                "original_path": request.video_path,
                "video_ref": output_ref,
                "output_ref": output_ref,
                "model": request.model,
                "scale": scale_value,
                "method": request.method,
            },
        ).model_dump(mode="json")

    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="enhancement",
        initial_message=f"Initializing {request.method}...",
        queued_message=f"Initializing {request.method}...",
        task_name=f"Enhance {source.name} ({request.method} {request.scale})",
        request_params=request.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
            task_id=task_id,
            worker_fn=enhancer.upscale,
            worker_kwargs={
                "input_path": request.video_path,
                "output_path": str(output_path),
                "model": request.model,
                "scale": scale_value,
                "method": request.method,
            },
            start_message=f"Running {request.method}...",
            success_message="Upscaling complete",
            result_transformer=transform_result,
        ),
    )


def execute_enhancement(
    request: EnhanceRequest,
    *,
    progress_callback,
):
    enhancer = RuntimeServices.enhancer()
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    source = Path(request.video_path or "")
    try:
        scale_value = int(request.scale.lower().replace("x", ""))
    except (AttributeError, ValueError):
        scale_value = 4
    output_path = str(source.parent / f"{source.stem}_{request.method}_{scale_value}x{source.suffix}")
    final_path = enhancer.upscale(
        input_path=request.video_path,
        output_path=output_path,
        model=request.model,
        scale=scale_value,
        method=request.method,
        progress_callback=progress_callback,
    )
    output_ref = create_media_ref(final_path, "video/mp4", role="output")
    return TaskResult(
        success=True,
        files=[FileRef(type="video", path=final_path, label="upscaled_video")],
        meta={
            "video_path": final_path,
            "original_path": request.video_path,
            "video_ref": output_ref,
            "output_ref": output_ref,
            "model": request.model,
            "scale": scale_value,
            "method": request.method,
        },
    ).model_dump(mode="json")


async def submit_cleanup_task(request: CleanRequest) -> dict:
    source = Path(request.video_path or "")
    method = request.method or "telea"
    output_path = source.with_name(f"{source.stem}_cleaned_{method}{source.suffix}")

    def transform_result(out_path: str):
        output_ref = create_media_ref(out_path, "video/mp4", role="output")
        return TaskResult(
            success=True,
            files=[FileRef(type="video", path=out_path, label="cleaned")],
            meta={
                "video_path": out_path,
                "video_ref": output_ref,
                "output_ref": output_ref,
                "original_path": request.video_path,
                "method": method,
            },
        ).model_dump(mode="json")

    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="cleanup",
        initial_message="Queued for Cleanup",
        queued_message="Queued for Cleanup",
        task_name=f"Clean {source.name}",
        request_params=request.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
            task_id=task_id,
            worker_fn=RuntimeServices.cleaner().clean_video,
            worker_kwargs={
                "input_path": request.video_path,
                "output_path": str(output_path),
                "roi": request.roi,
                "method": method,
            },
            start_message=f"Running Watermark Removal ({method})...",
            success_message="Cleanup complete",
            result_transformer=transform_result,
        ),
    )


def execute_cleanup(
    request: CleanRequest,
    *,
    progress_callback,
):
    source = Path(request.video_path or "")
    method = request.method or "telea"
    output_path = str(source.with_name(f"{source.stem}_cleaned_{method}{source.suffix}"))
    final_path = RuntimeServices.cleaner().clean_video(
        input_path=request.video_path,
        output_path=output_path,
        roi=request.roi,
        method=method,
        progress_callback=progress_callback,
    )
    output_ref = create_media_ref(final_path, "video/mp4", role="output")
    return TaskResult(
        success=True,
        files=[FileRef(type="video", path=final_path, label="cleaned")],
        meta={
            "video_path": final_path,
            "video_ref": output_ref,
            "output_ref": output_ref,
            "original_path": request.video_path,
            "method": method,
        },
    ).model_dump(mode="json")

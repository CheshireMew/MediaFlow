from pathlib import Path

from backend.core.runtime_access import RuntimeServices
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import (
    CleanRequest,
    EnhanceRequest,
)
from backend.application.preprocessing_results import (
    build_cleanup_result,
    build_enhancement_result,
    resolve_cleanup_method,
    resolve_cleanup_output_path,
    resolve_enhancement_output_path,
    resolve_enhancement_scale,
)


async def submit_enhancement_task(request: EnhanceRequest) -> dict:
    enhancer = RuntimeServices.enhancer()
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    scale_value = resolve_enhancement_scale(request)
    output_path = resolve_enhancement_output_path(request)

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
            result_transformer=lambda path: build_enhancement_result(request, path),
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
    scale_value = resolve_enhancement_scale(request)
    output_path = str(resolve_enhancement_output_path(request))
    final_path = enhancer.upscale(
        input_path=request.video_path,
        output_path=output_path,
        model=request.model,
        scale=scale_value,
        method=request.method,
        progress_callback=progress_callback,
    )
    return build_enhancement_result(request, final_path)


async def submit_cleanup_task(request: CleanRequest) -> dict:
    method = resolve_cleanup_method(request)
    output_path = resolve_cleanup_output_path(request)

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
            result_transformer=lambda path: build_cleanup_result(request, path),
        ),
    )


def execute_cleanup(
    request: CleanRequest,
    *,
    progress_callback,
):
    source = Path(request.video_path or "")
    method = resolve_cleanup_method(request)
    output_path = str(resolve_cleanup_output_path(request))
    final_path = RuntimeServices.cleaner().clean_video(
        input_path=request.video_path,
        output_path=output_path,
        roi=request.roi,
        method=method,
        progress_callback=progress_callback,
    )
    return build_cleanup_result(request, final_path)

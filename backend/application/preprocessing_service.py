from backend.core.container import Services
from backend.core.runtime_access import runtime_service
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


def _ensure_enhancement_available(request: EnhanceRequest) -> None:
    enhancer = runtime_service(Services.ENHANCER)
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)


async def _enhancement_background(task_id: str, request: EnhanceRequest) -> None:
    enhancer = runtime_service(Services.ENHANCER)
    scale_value = resolve_enhancement_scale(request)
    output_path = resolve_enhancement_output_path(request)
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=enhancer.upscale,
        worker_kwargs={
            "input_path": request.video_ref.path,
            "output_path": str(output_path),
            "model": request.model,
            "scale": scale_value,
            "method": request.method,
        },
        start_message=f"Running {request.method}...",
        success_message="Upscaling complete",
        result_transformer=lambda path: build_enhancement_result(request, path),
    )


async def _cleanup_background(task_id: str, request: CleanRequest) -> None:
    method = resolve_cleanup_method(request)
    output_path = resolve_cleanup_output_path(request)
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=runtime_service(Services.CLEANER).clean_video,
        worker_kwargs={
            "input_path": request.video_ref.path,
            "output_path": str(output_path),
            "roi": request.roi,
            "method": method,
        },
        start_message=f"Running Watermark Removal ({method})...",
        success_message="Cleanup complete",
        result_transformer=lambda path: build_cleanup_result(request, path),
    )

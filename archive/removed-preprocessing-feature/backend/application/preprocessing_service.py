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


def _ensure_enhancement_available(request: EnhanceRequest, *, enhancer) -> None:
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)


async def _enhancement_background(
    task_id: str,
    request: EnhanceRequest,
    *,
    enhancer,
    background_runner,
) -> None:
    scale_value = resolve_enhancement_scale(request)
    output_path = resolve_enhancement_output_path(request)
    await background_runner.run(
        task_id=task_id,
        worker_fn=enhancer.upscale,
        worker_kwargs={
            "input_path": request.video_ref.path,
            "output_path": str(output_path),
            "model": request.model,
            "scale": scale_value,
            "method": request.method,
        },
        start_message_code="enhancement_running",
        start_message_params={"method": request.method},
        success_message_code="enhancement_completed",
        result_transformer=lambda path: build_enhancement_result(request, path),
    )


async def _cleanup_background(
    task_id: str,
    request: CleanRequest,
    *,
    cleaner,
    background_runner,
) -> None:
    method = resolve_cleanup_method(request)
    output_path = resolve_cleanup_output_path(request)
    await background_runner.run(
        task_id=task_id,
        worker_fn=cleaner.clean_video,
        worker_kwargs={
            "input_path": request.video_ref.path,
            "output_path": str(output_path),
            "roi": request.roi,
            "method": method,
        },
        start_message_code="cleanup_running",
        start_message_params={"method": method},
        success_message_code="cleanup_completed",
        result_transformer=lambda path: build_cleanup_result(request, path),
    )

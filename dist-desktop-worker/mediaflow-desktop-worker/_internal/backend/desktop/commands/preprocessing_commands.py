from pathlib import Path
from typing import Any

from backend.core.runtime_access import RuntimeServices
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit
from backend.models.schemas import CleanRequest, EnhanceRequest


@register_worker_command("enhance")
def handle_enhance(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.preprocessing_service import execute_enhancement

    request = EnhanceRequest.model_validate(payload)
    if not request.video_path:
        raise ValueError("video_path or video_ref is required")

    enhancer = RuntimeServices.enhancer()
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    source = Path(request.video_path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {request.video_path}")

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "enhance_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": execute_enhancement(request, progress_callback=progress_callback),
    })


@register_worker_command("clean")
def handle_clean(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.preprocessing_service import execute_cleanup

    request = CleanRequest.model_validate(payload)
    if not request.video_path:
        raise ValueError("video_path or video_ref is required")

    source = Path(request.video_path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {request.video_path}")

    RuntimeServices.cleaner()

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "clean_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": execute_cleanup(request, progress_callback=progress_callback),
    })

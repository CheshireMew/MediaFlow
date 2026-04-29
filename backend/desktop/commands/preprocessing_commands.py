from pathlib import Path
from typing import Any

from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit
from backend.models.schemas import CleanRequest, EnhanceRequest


@register_worker_command("enhance")
def handle_enhance(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    request = EnhanceRequest.model_validate(payload)

    enhancer = runtime_service(Services.ENHANCER)
    if not enhancer.is_available(request.method):
        detail = (
            "Real-ESRGAN binary not found."
            if request.method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    source = Path(request.video_ref.path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {request.video_ref.path}")

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
        "result": execute_task_operation("enhancement", request, progress_callback=progress_callback),
    })


@register_worker_command("clean")
def handle_clean(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    request = CleanRequest.model_validate(payload)

    source = Path(request.video_ref.path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {request.video_ref.path}")

    runtime_service(Services.CLEANER)

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
        "result": execute_task_operation("cleanup", request, progress_callback=progress_callback),
    })

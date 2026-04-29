import json
from typing import Any

from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit
from backend.services.ocr.engine_provider import get_ocr_engine
from backend.models.schemas import MediaReference, OCRExtractRequest


@register_worker_command("extract")
def handle_extract(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    OCRExtractRequest.model_validate(payload)

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "extract_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    result = execute_task_operation("extract", payload, progress_callback=progress_callback)

    emit({
        "type": "event",
        "event": "extract_progress",
        "id": request_id,
        "payload": {
            "progress": 100,
            "message": "Extraction Complete",
        },
    })
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("get_ocr_results")
def handle_get_ocr_results(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.ocr_service import load_ocr_results

    video_ref = MediaReference.model_validate(payload["video_ref"])
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": load_ocr_results(video_ref.path),
    })

import json
import os
from typing import Any

from backend.application.ocr_service import execute_ocr, load_ocr_results
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit, get_ocr_engine
from backend.models.schemas import OCRExtractRequest


@register_worker_command("extract")
def handle_extract(request_id: str | None, payload: dict[str, Any]) -> None:
    request = OCRExtractRequest.model_validate(payload)
    if not request.video_path:
        raise ValueError("video_path or video_ref is required")
    if not os.path.exists(request.video_path):
        raise FileNotFoundError(f"Video file not found: {request.video_path}")

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

    result = execute_ocr(request, progress_callback=progress_callback)

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
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": load_ocr_results(payload["video_path"]),
    })

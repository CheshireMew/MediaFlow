from typing import Any

from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit
from backend.models.schemas import MediaReference


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

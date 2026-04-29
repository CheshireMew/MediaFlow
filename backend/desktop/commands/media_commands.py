from typing import Any

from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit


@register_worker_command("transcribe")
def handle_transcribe(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    def progress_callback(progress: int, message: str) -> None:
        emit({
            "type": "event",
            "event": "progress",
            "id": request_id,
            "payload": {
                "progress": progress,
                "message": message,
            },
        })

    result = execute_task_operation(
        "transcribe",
        payload,
        progress_callback=progress_callback,
        task_id=f"desktop-{request_id}",
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("translate")
def handle_translate(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    def progress_callback(progress: int, message: str) -> None:
        emit({
            "type": "event",
            "event": "translate_progress",
            "id": request_id,
            "payload": {
                "progress": progress,
                "message": message,
            },
        })

    result = execute_task_operation(
        "translate",
        payload,
        progress_callback=progress_callback,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("synthesize")
def handle_synthesize(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.task_operations import execute_task_operation

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "synthesize_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    result = execute_task_operation("synthesis", payload, progress_callback=progress_callback)

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })

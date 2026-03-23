import asyncio
from typing import Any

from backend.application.download_service import (
    analyze_url,
    execute_desktop_download,
    save_cookies,
)
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit


@register_worker_command("analyze_url")
def handle_analyze_url(request_id: str | None, payload: dict[str, Any]) -> None:
    result = asyncio.run(analyze_url(payload["url"]))
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result.model_dump(mode="json"),
    })


@register_worker_command("save_cookies")
def handle_save_cookies(request_id: str | None, payload: dict[str, Any]) -> None:
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": save_cookies(payload["domain"], payload["cookies"]),
    })


@register_worker_command("download")
def handle_download(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.desktop_download_flow_service import DesktopDownloadFlowRequest

    request = DesktopDownloadFlowRequest.model_validate(
        {
            **payload,
            "task_id": f"desktop-{request_id}",
        }
    )

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "download_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    result = execute_desktop_download(request, progress_callback=progress_callback)

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result.model_dump(mode="json"),
    })

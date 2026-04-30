import asyncio
from typing import Any

from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit


@register_worker_command("analyze_url")
def handle_analyze_url(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.download_service import analyze_url

    result = asyncio.run(analyze_url(payload["url"]))
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result.model_dump(mode="json"),
    })


@register_worker_command("save_cookies")
def handle_save_cookies(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.application.download_service import save_cookies

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": save_cookies(payload["domain"], payload["cookies"]),
    })

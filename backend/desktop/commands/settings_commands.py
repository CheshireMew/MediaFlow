from typing import Any

from backend.application.settings_service import SettingsApplicationService
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit, settings_service
from backend.services.settings_manager import UserSettings


def _settings_application() -> SettingsApplicationService:
    return SettingsApplicationService(settings_service())


@register_worker_command("get_settings")
def handle_get_settings(request_id: str | None, _payload: dict[str, Any]) -> None:
    settings = _settings_application().get_settings()
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": settings.model_dump(mode="json"),
    })


@register_worker_command("update_settings")
def handle_update_settings(request_id: str | None, payload: dict[str, Any]) -> None:
    settings = UserSettings.model_validate(payload["settings"])
    updated = _settings_application().update_settings(settings)
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": updated.model_dump(mode="json"),
    })


@register_worker_command("set_active_provider")
def handle_set_active_provider(request_id: str | None, payload: dict[str, Any]) -> None:
    result = _settings_application().set_active_provider(payload["provider_id"])
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("test_provider")
def handle_test_provider(request_id: str | None, payload: dict[str, Any]) -> None:
    result = _settings_application().test_provider_connection(
        name=payload.get("name"),
        base_url=payload["base_url"],
        api_key=payload["api_key"],
        model=payload["model"],
    )
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("update_yt_dlp")
def handle_update_yt_dlp(request_id: str | None, _payload: dict[str, Any]) -> None:
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": _settings_application().update_yt_dlp(),
    })

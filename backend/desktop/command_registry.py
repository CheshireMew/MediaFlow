from collections.abc import Callable
from dataclasses import dataclass
from importlib import import_module
from typing import Any


WorkerCommandHandler = Callable[[str | None, dict[str, Any]], None]

_COMMAND_HANDLERS: dict[str, WorkerCommandHandler] = {}
_LOADED_COMMAND_MODULES: set[str] = set()


@dataclass(frozen=True)
class WorkerCommandDefinition:
    module: str | None
    requires_runtime: bool = True


_COMMAND_DEFINITIONS: dict[str, WorkerCommandDefinition] = {
    "ping": WorkerCommandDefinition(module=None, requires_runtime=False),
    "transcribe": WorkerCommandDefinition("backend.desktop.commands.media_commands"),
    "translate": WorkerCommandDefinition("backend.desktop.commands.media_commands"),
    "synthesize": WorkerCommandDefinition("backend.desktop.commands.media_commands"),
    "glossary_list": WorkerCommandDefinition("backend.desktop.commands.glossary_commands"),
    "glossary_add": WorkerCommandDefinition("backend.desktop.commands.glossary_commands"),
    "glossary_delete": WorkerCommandDefinition("backend.desktop.commands.glossary_commands"),
    "extract": WorkerCommandDefinition("backend.desktop.commands.ocr_commands"),
    "get_ocr_results": WorkerCommandDefinition("backend.desktop.commands.ocr_commands"),
    "detect_silence": WorkerCommandDefinition(
        "backend.desktop.commands.editor_commands",
        requires_runtime=False,
    ),
    "transcribe_segment": WorkerCommandDefinition("backend.desktop.commands.editor_commands"),
    "translate_segment": WorkerCommandDefinition("backend.desktop.commands.editor_commands"),
    "upload_watermark": WorkerCommandDefinition("backend.desktop.commands.editor_commands"),
    "get_latest_watermark": WorkerCommandDefinition(
        "backend.desktop.commands.editor_commands",
        requires_runtime=False,
    ),
    "analyze_url": WorkerCommandDefinition("backend.desktop.commands.download_commands"),
    "save_cookies": WorkerCommandDefinition("backend.desktop.commands.download_commands"),
    "download": WorkerCommandDefinition("backend.desktop.commands.download_commands"),
    "enhance": WorkerCommandDefinition("backend.desktop.commands.preprocessing_commands"),
    "clean": WorkerCommandDefinition("backend.desktop.commands.preprocessing_commands"),
    "get_settings": WorkerCommandDefinition("backend.desktop.commands.settings_commands"),
    "update_settings": WorkerCommandDefinition("backend.desktop.commands.settings_commands"),
    "set_active_provider": WorkerCommandDefinition("backend.desktop.commands.settings_commands"),
    "test_provider": WorkerCommandDefinition("backend.desktop.commands.settings_commands"),
    "update_yt_dlp": WorkerCommandDefinition("backend.desktop.commands.settings_commands"),
}


def register_worker_command(command: str):
    def _decorator(handler: WorkerCommandHandler) -> WorkerCommandHandler:
        if command in _COMMAND_HANDLERS:
            raise RuntimeError(f"Worker command already registered: {command}")
        _COMMAND_HANDLERS[command] = handler
        return handler

    return _decorator


def get_worker_command_definition(command: str) -> WorkerCommandDefinition:
    definition = _COMMAND_DEFINITIONS.get(command)
    if definition is None:
        raise ValueError(f"Unknown worker command: {command}")
    return definition


def command_requires_runtime(command: str) -> bool:
    return get_worker_command_definition(command).requires_runtime


def ensure_worker_command_loaded(command: str) -> None:
    definition = get_worker_command_definition(command)
    if definition.module and definition.module not in _LOADED_COMMAND_MODULES:
        import_module(definition.module)
        _LOADED_COMMAND_MODULES.add(definition.module)

    if command != "ping" and command not in _COMMAND_HANDLERS:
        raise RuntimeError(f"Worker command not registered after loading: {command}")


def dispatch_worker_command(command: str, request_id: str | None, payload: dict[str, Any]) -> None:
    ensure_worker_command_loaded(command)
    handler = _COMMAND_HANDLERS.get(command)
    if handler is None:
        raise ValueError(f"Unknown worker command: {command}")
    handler(request_id, payload)

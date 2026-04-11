from collections.abc import Callable
from typing import Any


WorkerCommandHandler = Callable[[str | None, dict[str, Any]], None]

_COMMAND_HANDLERS: dict[str, WorkerCommandHandler] = {}


def register_worker_command(command: str):
    def _decorator(handler: WorkerCommandHandler) -> WorkerCommandHandler:
        if command in _COMMAND_HANDLERS:
            raise RuntimeError(f"Worker command already registered: {command}")
        _COMMAND_HANDLERS[command] = handler
        return handler

    return _decorator


def dispatch_worker_command(command: str, request_id: str | None, payload: dict[str, Any]) -> None:
    handler = _COMMAND_HANDLERS.get(command)
    if handler is None:
        raise ValueError(f"Unknown worker command: {command}")
    handler(request_id, payload)

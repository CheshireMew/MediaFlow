from collections.abc import Callable
from dataclasses import dataclass
from importlib import import_module
from typing import Any

from backend.contracts import DESKTOP_WORKER_CONTRACT


WorkerCommandHandler = Callable[[str | None, dict[str, Any]], None]

_COMMAND_HANDLERS: dict[str, WorkerCommandHandler] = {}
_LOADED_COMMAND_MODULES: set[str] = set()


@dataclass(frozen=True)
class WorkerCommandDefinition:
    module: str | None
    requires_runtime: bool = True


def _definition_from_contract(raw: dict[str, Any]) -> WorkerCommandDefinition:
    module = raw.get("pythonModule")
    if module is not None and not isinstance(module, str):
        raise TypeError("Desktop worker command pythonModule must be a string or null")
    return WorkerCommandDefinition(
        module=module,
        requires_runtime=bool(raw.get("requiresRuntime", True)),
    )


def _load_command_definitions() -> dict[str, WorkerCommandDefinition]:
    definitions: dict[str, WorkerCommandDefinition] = {}

    for raw in DESKTOP_WORKER_CONTRACT["invocations"].values():
        command = raw["workerCommand"]
        definitions[command] = _definition_from_contract(raw)

    for command, raw in DESKTOP_WORKER_CONTRACT.get("workerCommands", {}).items():
        definitions[command] = _definition_from_contract(raw)

    return definitions


_COMMAND_DEFINITIONS = _load_command_definitions()


def register_worker_command(command: str):
    def _decorator(handler: WorkerCommandHandler) -> WorkerCommandHandler:
        get_worker_command_definition(command)
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

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
    execution_lane: str = "control"
    payload_model: str | None = None


def _definition_from_contract(raw: dict[str, Any]) -> WorkerCommandDefinition:
    module = raw.get("pythonModule")
    if module is not None and not isinstance(module, str):
        raise TypeError("Desktop worker command pythonModule must be a string or null")
    return WorkerCommandDefinition(
        module=module,
        requires_runtime=bool(raw.get("requiresRuntime", True)),
        execution_lane=str(raw.get("executionLane", "control")),
        payload_model=raw.get("payloadModel") if isinstance(raw.get("payloadModel"), str) else None,
    )


def _load_command_definitions() -> dict[str, WorkerCommandDefinition]:
    definitions: dict[str, WorkerCommandDefinition] = {}

    for raw in DESKTOP_WORKER_CONTRACT["invocations"].values():
        command = raw["workerCommand"]
        definition = _definition_from_contract(raw)
        if definition.execution_lane == "task":
            raise RuntimeError(f"Desktop worker contract cannot own task command: {command}")
        definitions[command] = definition

    for command, raw in DESKTOP_WORKER_CONTRACT.get("workerCommands", {}).items():
        definition = _definition_from_contract(raw)
        if definition.execution_lane == "task":
            raise RuntimeError(f"Desktop worker contract cannot own task command: {command}")
        definitions[command] = definition

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
    handler(request_id, validate_worker_payload(command, payload))


def validate_worker_payload(command: str, payload: dict[str, Any]) -> dict[str, Any]:
    definition = get_worker_command_definition(command)
    if not definition.payload_model:
        return payload

    module_name, class_name = definition.payload_model.rsplit(".", 1)
    model_cls = getattr(import_module(module_name), class_name)
    model = model_cls.model_validate(payload)
    validated = model.model_dump(mode="json")
    for key in ("task_id", "created_at"):
        if key in payload:
            validated[key] = payload[key]
    return validated

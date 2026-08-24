import json
from functools import lru_cache
from pathlib import Path
import sys
from typing import Any


def _contract_dir() -> Path:
    bundled_root = getattr(sys, "_MEIPASS", None)
    if bundled_root:
        return Path(bundled_root) / "contracts"
    return Path(__file__).resolve().parent.parent / "contracts"


@lru_cache(maxsize=None)
def load_contract(filename: str) -> dict[str, Any]:
    if Path(filename).name != filename or not filename.endswith(".json"):
        raise ValueError(f"Invalid contract filename: {filename}")
    contract_path = _contract_dir() / filename
    with contract_path.open("r", encoding="utf-8") as contract_file:
        payload = json.load(contract_file)
    if not isinstance(payload, dict):
        raise ValueError(f"Contract root must be an object: {filename}")
    return payload


@lru_cache(maxsize=1)
def _load_runtime_contract() -> dict[str, Any]:
    return load_contract("runtime-contract.json")


@lru_cache(maxsize=1)
def _load_task_catalog() -> dict[str, Any]:
    return load_contract("task-catalog.json")


RUNTIME_CONTRACT = _load_runtime_contract()
TASK_CONTRACT_VERSION = int(RUNTIME_CONTRACT["task_contract_version"])
TASK_LIFECYCLE = RUNTIME_CONTRACT["task_lifecycle"]
TASK_STATUSES = set(RUNTIME_CONTRACT["task_statuses"])
TASK_SOURCES = set(RUNTIME_CONTRACT["task_sources"])
TASK_PERSISTENCE_SCOPES = set(RUNTIME_CONTRACT["task_persistence_scopes"])
TASK_QUEUE_STATES = set(RUNTIME_CONTRACT["task_queue_states"])
TASK_MESSAGE_CODES = set(RUNTIME_CONTRACT["task_message_codes"])
TASK_STATUS_PROJECTION = RUNTIME_CONTRACT["task_status_projection"]
TASK_STATUS_TRANSITIONS = RUNTIME_CONTRACT["task_status_transitions"]
ASR_EXECUTION_PREFERENCES = RUNTIME_CONTRACT["asr_execution_preferences"]


def task_types() -> set[str]:
    return set(_load_task_catalog()["task_types"])


def require_task_type(task_type: str) -> str:
    if task_type not in task_types():
        raise ValueError(f"Unknown task type in task catalog: {task_type}")
    return task_type


def pipeline_step_definitions() -> dict[str, dict[str, str]]:
    return dict(_load_task_catalog()["pipeline_steps"])


def pipeline_step_names() -> set[str]:
    return set(pipeline_step_definitions())


def pipeline_step_operation(step_name: str) -> str:
    return str(pipeline_step_definitions()[step_name]["operation"])


def pipeline_step_param_model_names() -> dict[str, str]:
    return {
        step_name: str(definition["params_model"])
        for step_name, definition in pipeline_step_definitions().items()
    }


def require_task_message_code(code: str) -> str:
    if code not in TASK_MESSAGE_CODES:
        raise ValueError(f"Unknown task message code: {code}")
    return code


def task_status_projection(status: str) -> dict[str, Any]:
    try:
        return TASK_STATUS_PROJECTION[status]
    except KeyError as exc:
        raise ValueError(f"Unknown task status: {status}") from exc


def task_persistence_scope(status: str) -> str:
    return str(task_status_projection(status)["persistence_scope"])


def task_lifecycle(status: str) -> str:
    return str(task_status_projection(status)["lifecycle"])


def task_queue_state(status: str) -> str:
    return str(task_status_projection(status)["queue_state"])


def require_task_status_transition(current: str, target: str) -> None:
    if current == target:
        return
    allowed = TASK_STATUS_TRANSITIONS.get(current)
    if allowed is None:
        raise ValueError(f"Unknown current task status: {current}")
    if target not in allowed:
        raise ValueError(f"Invalid task status transition: {current} -> {target}")

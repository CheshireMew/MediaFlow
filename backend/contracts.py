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


@lru_cache(maxsize=1)
def _load_runtime_contract() -> dict[str, Any]:
    contract_path = _contract_dir() / "runtime-contract.json"
    with contract_path.open("r", encoding="utf-8") as contract_file:
        return json.load(contract_file)


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

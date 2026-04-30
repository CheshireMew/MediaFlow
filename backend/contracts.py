import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=1)
def _load_runtime_contract() -> dict[str, Any]:
    contract_path = Path(__file__).resolve().parent.parent / "contracts" / "runtime-contract.json"
    with contract_path.open("r", encoding="utf-8") as contract_file:
        return json.load(contract_file)


@lru_cache(maxsize=1)
def _load_desktop_worker_contract() -> dict[str, Any]:
    contract_path = Path(__file__).resolve().parent.parent / "contracts" / "desktop-worker-contract.json"
    with contract_path.open("r", encoding="utf-8") as contract_file:
        return json.load(contract_file)


RUNTIME_CONTRACT = _load_runtime_contract()
DESKTOP_WORKER_CONTRACT = _load_desktop_worker_contract()
TASK_CONTRACT_VERSION = int(RUNTIME_CONTRACT["task_contract_version"])
DESKTOP_WORKER_PROTOCOL_VERSION = int(DESKTOP_WORKER_CONTRACT["protocol_version"])
TASK_OWNER_MODE = str(RUNTIME_CONTRACT["task_owner_mode"])
TASK_LIFECYCLE = RUNTIME_CONTRACT["task_lifecycle"]
TASK_STATUSES = set(RUNTIME_CONTRACT["task_statuses"])
TASK_SOURCES = set(RUNTIME_CONTRACT["task_sources"])
TASK_PERSISTENCE_SCOPES = set(RUNTIME_CONTRACT["task_persistence_scopes"])
TASK_QUEUE_STATES = set(RUNTIME_CONTRACT["task_queue_states"])

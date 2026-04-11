import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=1)
def _load_runtime_contract() -> dict[str, Any]:
    contract_path = Path(__file__).resolve().parent.parent / "contracts" / "runtime-contract.json"
    with contract_path.open("r", encoding="utf-8") as contract_file:
        return json.load(contract_file)


RUNTIME_CONTRACT = _load_runtime_contract()
TASK_CONTRACT_VERSION = int(RUNTIME_CONTRACT["task_contract_version"])
DESKTOP_TASK_OWNER_MODE = str(RUNTIME_CONTRACT["desktop_task_owner_mode"])
WEB_TASK_OWNER_MODE = str(RUNTIME_CONTRACT["web_task_owner_mode"])
TASK_LIFECYCLE = RUNTIME_CONTRACT["task_lifecycle"]

import json
from functools import lru_cache
from pathlib import Path
from typing import Any



@lru_cache(maxsize=1)
def load_task_catalog() -> dict[str, Any]:
    catalog_path = Path(__file__).resolve().parents[2] / "contracts" / "task-catalog.json"
    with catalog_path.open("r", encoding="utf-8") as catalog_file:
        return json.load(catalog_file)


def task_types() -> set[str]:
    return set(load_task_catalog()["task_types"])


def require_task_type(task_type: str) -> str:
    if task_type not in task_types():
        raise ValueError(f"Unknown task type in task catalog: {task_type}")
    return task_type


def pipeline_step_names() -> set[str]:
    return set(load_task_catalog()["pipeline_steps"])


def pipeline_step_to_type(step_name: str) -> str:
    return load_task_catalog()["pipeline_steps"][step_name]["task_type"]

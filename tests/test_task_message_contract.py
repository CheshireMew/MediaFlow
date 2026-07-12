import json
from pathlib import Path

import pytest

from backend.contracts import TASK_MESSAGE_CODES
from backend.models.schemas import TaskView
from backend.models.task_message import validate_task_message
from backend.models.task_model import Task


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_task_message_catalog_is_unique_and_every_code_has_a_backend_producer():
    contract = json.loads(
        (REPO_ROOT / "contracts" / "runtime-contract.json").read_text(encoding="utf-8")
    )
    catalog = contract["task_message_codes"]
    assert len(catalog) == len(set(catalog))
    assert set(catalog) == TASK_MESSAGE_CODES

    producer_source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (REPO_ROOT / "backend").rglob("*.py")
        if path.name not in {"contracts.py", "task_message.py"}
    )
    for code in catalog:
        assert f'"{code}"' in producer_source or f"'{code}'" in producer_source, code


def test_runtime_task_models_have_only_structured_message_fields():
    for model in (Task, TaskView):
        assert "message" not in model.model_fields
        assert {"message_code", "message_params"} <= set(model.model_fields)


def test_task_message_validation_rejects_unknown_codes_and_nested_params():
    with pytest.raises(ValueError, match="Unknown task message code"):
        validate_task_message("free-form backend text", {})

    with pytest.raises(ValueError, match="scalar JSON values"):
        validate_task_message("queued", {"nested": {"text": "not allowed"}})

    with pytest.raises(ValueError, match="scalar JSON values"):
        validate_task_message("queued", {"progress": float("nan")})

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from backend.core.tasks.registry import (
    build_task_runner,
    REQUIRED_TASK_TYPES,
    register_all_task_runners,
    registered_task_types,
    validate_required_task_runners,
)
from backend.contracts import DESKTOP_WORKER_CONTRACT
from backend.core.task_catalog import pipeline_step_names, task_types
from backend.models.schemas import PIPELINE_STEP_PARAM_MODELS, PipelineRequest
from backend.models.task_model import Task


def verify_registry():
    print("Verifying task runner registry...")

    register_all_task_runners()
    validate_required_task_runners()

    expected = REQUIRED_TASK_TYPES
    registered = registered_task_types()
    missing = expected - registered
    if missing:
        raise RuntimeError(f"Missing task runners: {sorted(missing)}")

    print(f"Registered task runners: {sorted(registered)}")


def verify_runner_build():
    print("\nVerifying task runner build...")

    task = Task(
        id="test-123",
        type="transcribe",
        status="failed",
        request_params={
            "audio_ref": {"path": "test.wav", "name": "test.wav"},
            "model": "base",
            "language": "en",
        },
    )

    runner = build_task_runner(task)
    if not callable(runner):
        raise RuntimeError(f"build_task_runner returned non-callable: {runner!r}")

    print("build_task_runner('transcribe') returned a callable runner.")


def verify_catalog_boundaries():
    print("\nVerifying task catalog boundaries...")

    PipelineRequest.model_json_schema()
    schema_step_names = set(PIPELINE_STEP_PARAM_MODELS)
    catalog_step_names = pipeline_step_names()
    if schema_step_names != catalog_step_names:
        raise RuntimeError(
            "Pipeline schema/catalog mismatch: "
            f"schema={sorted(schema_step_names)}, catalog={sorted(catalog_step_names)}"
        )

    contract_task_commands = {
        raw["workerCommand"]
        for raw in DESKTOP_WORKER_CONTRACT["invocations"].values()
        if raw.get("executionLane") == "task"
    }
    contract_task_commands.update(
        command
        for command, raw in DESKTOP_WORKER_CONTRACT.get("workerCommands", {}).items()
        if raw.get("executionLane") == "task"
    )
    if contract_task_commands:
        raise RuntimeError(
            "Desktop worker contract must not own task commands: "
            f"contract={sorted(contract_task_commands)}"
        )

    unknown_registered = registered_task_types() - task_types()
    if unknown_registered:
        raise RuntimeError(f"Registered task types outside catalog: {sorted(unknown_registered)}")

    print("Task types and pipeline steps match the catalog; desktop worker owns no task commands.")


if __name__ == "__main__":
    verify_registry()
    verify_runner_build()
    verify_catalog_boundaries()

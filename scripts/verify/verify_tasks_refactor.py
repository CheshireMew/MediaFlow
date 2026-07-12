import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.application.task_definitions import build_task_runner_registry
from backend.core.task_catalog import (
    pipeline_step_names,
    task_types,
)
from backend.core.tasks.registry import TaskRunnerRegistry
from backend.models.schemas import PIPELINE_STEP_PARAM_MODELS, PipelineRequest
from backend.models.task_model import Task


class _PipelineRunner:
    async def run(self, _steps, _task_id):
        return None


class _OperationExecutor:
    @staticmethod
    def build_runner(_task):
        async def run():
            return None

        return run


def create_registry() -> TaskRunnerRegistry:
    return build_task_runner_registry(
        pipeline_runner=_PipelineRunner(),
        operation_executor=_OperationExecutor(),
    )


def verify_registry(registry: TaskRunnerRegistry):
    print("Verifying task runner registry...")

    registry.validate()
    expected = task_types()
    registered = registry.registered_task_types()
    missing = expected - registered
    if missing:
        raise RuntimeError(f"Missing task runners: {sorted(missing)}")

    print(f"Registered task runners: {sorted(registered)}")


def verify_runner_build(registry: TaskRunnerRegistry):
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

    runner = registry.build(task)
    if not callable(runner):
        raise RuntimeError(f"TaskRunnerRegistry.build returned non-callable: {runner!r}")

    print("TaskRunnerRegistry.build('transcribe') returned a callable runner.")


def verify_catalog_boundaries(registry: TaskRunnerRegistry):
    print("\nVerifying task catalog boundaries...")

    PipelineRequest.model_json_schema()
    schema_step_names = set(PIPELINE_STEP_PARAM_MODELS)
    catalog_step_names = pipeline_step_names()
    if schema_step_names != catalog_step_names:
        raise RuntimeError(
            "Pipeline schema/catalog mismatch: "
            f"schema={sorted(schema_step_names)}, catalog={sorted(catalog_step_names)}"
        )

    unknown_registered = registry.registered_task_types() - task_types()
    if unknown_registered:
        raise RuntimeError(f"Registered task types outside catalog: {sorted(unknown_registered)}")

    print("Task types and pipeline steps match the catalog.")


if __name__ == "__main__":
    task_runner_registry = create_registry()
    verify_registry(task_runner_registry)
    verify_runner_build(task_runner_registry)
    verify_catalog_boundaries(task_runner_registry)

from backend.application.task_definitions import build_task_runner_registry
from backend.core.task_catalog import task_types


def test_composed_task_runner_registry_covers_catalog_task_types():
    class FakePipelineRunner:
        async def run(self, _steps, _task_id):
            return None

    class FakeOperationExecutor:
        @staticmethod
        def task_operation(_task_type):
            class Operation:
                background = staticmethod(lambda _task_id, _request: None)

            return Operation()

        @staticmethod
        def build_runner(_task):
            return lambda: None

    registry = build_task_runner_registry(
        pipeline_runner=FakePipelineRunner(),
        operation_executor=FakeOperationExecutor(),
    )

    assert task_types().issubset(registry.registered_task_types())

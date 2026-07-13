from backend.core.task_catalog import task_types
from backend.core.tasks.registry import TaskRunnerRegistry


def _pipeline_runner(pipeline_runner, task):
    from backend.models.schemas import PipelineRequest

    request = PipelineRequest(**task.request_params)
    return lambda: pipeline_runner.run(request.steps, task.id)


def build_task_runner_registry(*, pipeline_runner, operation_executor) -> TaskRunnerRegistry:
    registry = TaskRunnerRegistry()
    pipeline_factory = lambda task: _pipeline_runner(pipeline_runner, task)
    registry.register("pipeline", pipeline_factory)
    registry.register("download", pipeline_factory)

    for task_type in sorted(task_types() - {"pipeline", "download"}):
        operation = operation_executor.task_operation(task_type)
        if operation.background is None:
            raise RuntimeError(
                f"Task catalog type has no background operation: {task_type}"
            )
        registry.register(task_type, operation_executor.build_runner)

    registry.validate()
    return registry

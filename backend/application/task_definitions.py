from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.core.task_catalog import task_types
from backend.core.tasks.registry import register_task_runner


def _pipeline_runner(task):
    from backend.models.schemas import PipelineRequest

    request = PipelineRequest(**task.request_params)
    return lambda: runtime_service(Services.PIPELINE).run(request.steps, task.id)


def _operation_runner(task):
    from backend.application.task_operations import build_operation_runner

    return build_operation_runner(task)


register_task_runner("pipeline", _pipeline_runner)
register_task_runner("download", _pipeline_runner)

for _task_type in sorted(task_types() - {"pipeline", "download"}):
    register_task_runner(_task_type, _operation_runner)

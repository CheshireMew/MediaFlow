from backend.application.task_operations import build_operation_runner, validate_task_operations
from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.core.task_catalog import task_types
from backend.core.tasks.registry import register_task_runner
from backend.models.schemas import PipelineRequest
from backend.models.task_model import Task


def _pipeline_runner(task: Task):
    request = PipelineRequest(**task.request_params)
    return lambda: runtime_service(Services.PIPELINE).run(request.steps, task.id)


validate_task_operations(task_types())

register_task_runner("pipeline", _pipeline_runner)
register_task_runner("download", _pipeline_runner)

for _task_type in (
    "transcribe",
    "transcribe_segment",
    "translate",
    "synthesis",
    "extract",
    "enhancement",
    "cleanup",
):
    register_task_runner(_task_type, build_operation_runner)

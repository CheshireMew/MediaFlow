from collections.abc import Awaitable, Callable

from backend.core.container import Services, container
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.schemas import PipelineRequest
from backend.models.task_model import Task


@TaskHandlerRegistry.register("download")
class DownloadHandler(TaskHandler):
    """Rebuilds single-step download tasks through the pipeline runner."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        req = PipelineRequest(**task.request_params)
        pipeline_runner = container.get(Services.PIPELINE)
        return lambda: pipeline_runner.run(req.steps, task.id)

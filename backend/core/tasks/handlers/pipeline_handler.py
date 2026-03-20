from collections.abc import Awaitable, Callable
from backend.models.task_model import Task
from backend.models.schemas import PipelineRequest
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.core.container import container, Services
from loguru import logger

@TaskHandlerRegistry.register("pipeline")
class PipelineHandler(TaskHandler):
    """Handles general pipeline tasks (like video download/process)."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = PipelineRequest(**task.request_params)
            pipeline_runner = container.get(Services.PIPELINE)
            return lambda: pipeline_runner.run(req.steps, task.id)
        except Exception as e:
            logger.error(f"Failed to resume pipeline task {task.id}: {e}")
            raise

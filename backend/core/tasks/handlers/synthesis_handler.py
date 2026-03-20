from collections.abc import Awaitable, Callable
from backend.models.schemas import SynthesisRequest
from backend.models.task_model import Task
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.api.v1.editor import run_synthesis_task
from loguru import logger

@TaskHandlerRegistry.register("synthesis")
class SynthesisHandler(TaskHandler):
    """Handles video synthesis tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = SynthesisRequest(**task.request_params)
            return lambda: run_synthesis_task(task.id, req)
        except Exception as e:
            logger.error(f"Failed to resume synthesis task {task.id}: {e}")
            raise

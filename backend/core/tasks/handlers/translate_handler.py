from collections.abc import Awaitable, Callable

from backend.api.v1.translate import TranslateRequest, run_translation_task
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.task_model import Task


@TaskHandlerRegistry.register("translate")
class TranslateHandler(TaskHandler):
    """Handles translation tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        req = TranslateRequest(**task.request_params)
        return lambda: run_translation_task(task.id, req)

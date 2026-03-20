from collections.abc import Awaitable, Callable
from backend.models.schemas import TranscribeRequest
from backend.models.task_model import Task
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.api.v1.transcribe import run_transcription_task
from loguru import logger

@TaskHandlerRegistry.register("transcribe")
class TranscribeHandler(TaskHandler):
    """Handles transcription tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = TranscribeRequest(**task.request_params)
            return lambda: run_transcription_task(task.id, req)
        except Exception as e:
            logger.error(f"Failed to resume transcribe task {task.id}: {e}")
            raise

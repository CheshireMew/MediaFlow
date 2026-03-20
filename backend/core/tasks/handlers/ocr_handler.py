from collections.abc import Awaitable, Callable

from backend.api.v1.ocr import OCRExtractRequest, run_ocr_task
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.task_model import Task


@TaskHandlerRegistry.register("extract")
class OCRExtractHandler(TaskHandler):
    """Handles OCR extraction tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        req = OCRExtractRequest(**task.request_params)
        return lambda: run_ocr_task(task.id, req)

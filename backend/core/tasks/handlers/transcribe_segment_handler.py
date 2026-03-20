from collections.abc import Awaitable, Callable

from backend.api.v1.transcribe import TranscribeSegmentRequest
from backend.core.container import Services, container
from backend.core.task_runner import BackgroundTaskRunner
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.task_model import Task


@TaskHandlerRegistry.register("transcribe_segment")
class TranscribeSegmentHandler(TaskHandler):
    """Handles long segment transcription tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        req = TranscribeSegmentRequest(**task.request_params)
        service = container.get(Services.ASR)
        return lambda: BackgroundTaskRunner.run(
            task_id=task.id,
            worker_fn=service.transcribe_segment,
            worker_kwargs={
                "audio_path": req.audio_path,
                "start": req.start,
                "end": req.end,
                "model_name": req.model,
                "device": req.device,
                "language": req.language,
                "task_id": task.id,
            },
            start_message="Processing segment...",
            success_message="Segment transcribed",
        )

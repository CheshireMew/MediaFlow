from collections.abc import Awaitable, Callable

from backend.application.transcription_service import supported_kwargs
from backend.core.runtime_access import RuntimeServices
from backend.core.task_runner import BackgroundTaskRunner
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.schemas import TranscribeSegmentRequest
from backend.models.task_model import Task


@TaskHandlerRegistry.register("transcribe_segment")
class TranscribeSegmentHandler(TaskHandler):
    """Handles long segment transcription tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        req = TranscribeSegmentRequest(**task.request_params)
        service = RuntimeServices.asr()
        worker_kwargs = supported_kwargs(
            service.transcribe_segment,
            {
                "audio_path": req.audio_path,
                "start": req.start,
                "end": req.end,
                "model_name": req.model,
                "device": req.device,
                "engine": req.engine,
                "language": req.language,
                "task_id": task.id,
            },
        )
        return lambda: BackgroundTaskRunner.run(
            task_id=task.id,
            worker_fn=service.transcribe_segment,
            worker_kwargs=worker_kwargs,
            start_message="Processing segment...",
            success_message="Segment transcribed",
        )

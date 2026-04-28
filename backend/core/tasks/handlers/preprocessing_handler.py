from collections.abc import Awaitable, Callable
from backend.models.task_model import Task
from backend.core.runtime_access import RuntimeServices
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import CleanRequest, EnhanceRequest
from backend.application.preprocessing_results import (
    build_cleanup_result,
    build_enhancement_result,
    resolve_cleanup_method,
    resolve_cleanup_output_path,
    resolve_enhancement_output_path,
    resolve_enhancement_scale,
)
from loguru import logger

@TaskHandlerRegistry.register("enhancement")
class EnhancementHandler(TaskHandler):
    """Handles video enhancement tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = EnhanceRequest(**task.request_params)
            enhancer = RuntimeServices.enhancer()
            scale_val = resolve_enhancement_scale(req)
            output_path = resolve_enhancement_output_path(req)

            return lambda: BackgroundTaskRunner.run(
                task_id=task.id,
                worker_fn=enhancer.upscale,
                worker_kwargs={
                    "input_path": req.video_path,
                    "output_path": str(output_path),
                    "model": req.model,
                    "scale": scale_val,
                    "method": req.method
                },
                start_message=f"Resuming {req.method}...",
                success_message="Upscaling complete",
                result_transformer=lambda path: build_enhancement_result(req, path)
            )

        except Exception as e:
            logger.error(f"Failed to resume enhancement task {task.id}: {e}")
            raise

@TaskHandlerRegistry.register("cleanup")
class CleanupHandler(TaskHandler):
    """Handles video cleanup tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = CleanRequest(**task.request_params)
            cleaner = RuntimeServices.cleaner()
            method = resolve_cleanup_method(req)
            output_path = resolve_cleanup_output_path(req)

            return lambda: BackgroundTaskRunner.run(
                task_id=task.id,
                worker_fn=cleaner.clean_video,
                worker_kwargs={
                    "input_path": req.video_path,
                    "output_path": str(output_path),
                    "roi": req.roi,
                    "method": method
                },
                start_message=f"Resuming Watermark Removal ({method})...",
                success_message="Cleanup complete",
                result_transformer=lambda path: build_cleanup_result(req, path)
            )

        except Exception as e:
            logger.error(f"Failed to resume cleanup task {task.id}: {e}")
            raise

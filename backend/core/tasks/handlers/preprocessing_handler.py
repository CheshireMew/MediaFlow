from collections.abc import Awaitable, Callable
from backend.models.schemas import TaskResult, FileRef
from backend.models.task_model import Task
from backend.core.tasks.base import TaskHandler
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.core.container import container, Services
from backend.core.task_runner import BackgroundTaskRunner
from backend.api.v1.preprocessing import EnhanceRequest, CleanRequest
from pathlib import Path
from loguru import logger

@TaskHandlerRegistry.register("enhancement")
class EnhancementHandler(TaskHandler):
    """Handles video enhancement tasks."""

    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        try:
            req = EnhanceRequest(**task.request_params)
            enhancer = container.get(Services.ENHANCER)
            
            p = Path(req.video_path)
            try:
                scale_val = int(req.scale.lower().replace('x', ''))
            except (ValueError, AttributeError):
                scale_val = 4
            output_filename = f"{p.stem}_{req.method}_{scale_val}x{p.suffix}"
            output_path = p.parent / output_filename

            def transform_result(path):
                return TaskResult(
                    success=True,
                    files=[FileRef(type="video", path=path, label="upscaled_video")],
                    meta={
                        "video_path": path,
                        "original_path": req.video_path,
                        "model": req.model,
                        "scale": scale_val,
                        "method": req.method
                    }
                ).dict()

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
                result_transformer=transform_result
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
            # Assuming CLEANER service exists in container
            cleaner = container.get(Services.CLEANER)
            
            p = Path(req.video_path)
            method = req.method or "telea"
            output_path = p.with_name(f"{p.stem}_cleaned_{method}{p.suffix}")

            def save_result(out_path):
                return TaskResult(
                    success=True,
                    files=[FileRef(type="video", path=out_path, label="cleaned")],
                    meta={"video_path": out_path}
                ).dict()

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
                result_transformer=save_result
            )

        except Exception as e:
            logger.error(f"Failed to resume cleanup task {task.id}: {e}")
            raise

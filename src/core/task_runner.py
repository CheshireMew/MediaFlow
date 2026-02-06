"""
Background Task Runner - Common utility for running async background tasks with progress tracking.
Eliminates code duplication across transcribe, translate, and other API endpoints.
"""
import asyncio
from typing import Callable, Any, Optional, Dict
from loguru import logger

from src.core.container import container, Services


def _get_task_manager():
    """Get task manager from container (lazy load)."""
    return container.get(Services.TASK_MANAGER)



class BackgroundTaskRunner:
    """
    A reusable runner for background tasks that:
    1. Updates task status to 'running'
    2. Creates a thread-safe progress callback
    3. Runs the blocking worker function in an executor
    4. Updates task status to 'completed' or 'failed'
    """

    @staticmethod
    async def run(
        task_id: str,
        worker_fn: Callable[..., Any],
        worker_kwargs: Dict[str, Any],
        start_message: str = "Starting...",
        success_message: str = "Completed successfully",
        result_transformer: Optional[Callable[[Any], Any]] = None,
        progress_key: str = "progress_callback"
    ):
        """
        Execute a blocking worker function as a background task.
        
        Args:
            task_id: The task ID to track progress
            worker_fn: The blocking function to run (e.g., asr_service.transcribe)
            worker_kwargs: Keyword arguments to pass to worker_fn
            start_message: Message to display when task starts
            success_message: Message to display on completion
            result_transformer: Optional function to transform the result before saving
            progress_key: The kwarg name for the progress callback in worker_fn
        """
        try:
            # 1. Update status to running
            await _get_task_manager().update_task(
                task_id, 
                status="running", 
                message=start_message
            )
            
            # 2. Create thread-safe progress callback
            loop = asyncio.get_running_loop()
            
            def progress_callback(progress: int, message: str):
                asyncio.run_coroutine_threadsafe(
                    _get_task_manager().update_task(
                        task_id, 
                        progress=float(progress), 
                        message=message
                    ),
                    loop
                )
            
            # Inject progress callback into worker kwargs
            worker_kwargs[progress_key] = progress_callback
            
            # 3. Run blocking function in executor
            result = await loop.run_in_executor(
                None,
                lambda: worker_fn(**worker_kwargs)
            )
            
            # 4. Transform result if needed
            final_result = result
            if result_transformer:
                final_result = result_transformer(result)
            elif hasattr(result, 'dict'):
                # Pydantic model - auto-serialize
                final_result = result.dict()
            
            # 5. Update task as completed
            await _get_task_manager().update_task(
                task_id,
                status="completed",
                progress=100.0,
                message=success_message,
                result=final_result
            )
            logger.success(f"Task {task_id} completed.")
            
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            await _get_task_manager().update_task(
                task_id,
                status="failed",
                message=str(e),
                error=str(e)
            )


# Convenience function for simple usage
async def run_background_task(
    task_id: str,
    worker_fn: Callable,
    worker_kwargs: Dict[str, Any],
    **options
):
    """Shortcut to BackgroundTaskRunner.run()"""
    await BackgroundTaskRunner.run(task_id, worker_fn, worker_kwargs, **options)

"""
Background Task Runner - Common utility for running async background tasks with progress tracking.
Eliminates code duplication across transcribe, translate, and other API endpoints.
"""
import asyncio
import threading
from typing import Callable, Any, Optional, Dict
from loguru import logger

from backend.core.container import container, Services
from backend.core.task_control import TaskCancelRequested, TaskPauseRequested



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
        progress_futures = []
        accept_progress_updates = True
        progress_gate = threading.Lock()

        async def flush_progress_updates():
            nonlocal accept_progress_updates
            with progress_gate:
                accept_progress_updates = False
            index = 0
            while index < len(progress_futures):
                future = progress_futures[index]
                index += 1
                try:
                    await asyncio.wrap_future(future)
                except Exception:
                    continue

        try:
            task_manager = container.get(Services.TASK_MANAGER)
            # 1. Update status to running
            await task_manager.update_task(
                task_id, 
                status="running", 
                cancelled=False,
                message=start_message
            )
            
            # 2. Create thread-safe progress callback
            loop = asyncio.get_running_loop()
            
            def progress_callback(progress: int, message: str):
                with progress_gate:
                    if not accept_progress_updates:
                        return
                    task_manager.raise_if_control_requested(task_id)
                    if loop.is_closed():
                        return
                    future = task_manager.submit_threadsafe_update(
                        loop,
                        task_id,
                        progress=float(progress),
                        message=message,
                    )
                    if future is not None:
                        progress_futures.append(future)
            
            # Inject progress callback into worker kwargs
            worker_kwargs[progress_key] = progress_callback
            
            # 3. Run blocking function in executor
            result = await loop.run_in_executor(
                None,
                lambda: worker_fn(**worker_kwargs)
            )

            await flush_progress_updates()
            
            # 4. Transform result if needed
            final_result = result
            if result_transformer:
                final_result = result_transformer(result)
            elif hasattr(result, 'model_dump'):
                final_result = result.model_dump()
            elif hasattr(result, 'dict'):
                # Pydantic model - auto-serialize
                final_result = result.dict()
            
            # 5. Update task as completed
            await container.get(Services.TASK_MANAGER).update_task(
                task_id,
                status="completed",
                cancelled=False,
                progress=100.0,
                message=success_message,
                result=final_result
            )
            logger.success(f"Task {task_id} completed.")
            
        except TaskPauseRequested as e:
            await flush_progress_updates()
            logger.info(f"Task {task_id} paused: {e}")
            await container.get(Services.TASK_MANAGER).mark_controlled_stop(task_id, "pause", str(e))
        except TaskCancelRequested as e:
            await flush_progress_updates()
            logger.info(f"Task {task_id} cancelled: {e}")
            await container.get(Services.TASK_MANAGER).mark_controlled_stop(task_id, "cancel", str(e))
        except Exception as e:
            control_request = container.get(Services.TASK_MANAGER).get_stop_request(task_id)
            if control_request in {"pause", "cancel"}:
                await flush_progress_updates()
                logger.info(f"Task {task_id} stopped cooperatively during failure path: {e}")
                await container.get(Services.TASK_MANAGER).mark_controlled_stop(task_id, control_request, str(e))
                return
            logger.error(f"Task {task_id} failed: {e}")
            await container.get(Services.TASK_MANAGER).update_task(
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

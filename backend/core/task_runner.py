"""
Background Task Runner - Common utility for running async background tasks with progress tracking.
Eliminates code duplication across transcribe, translate, and other API endpoints.
"""
import asyncio
import threading
from typing import Callable, Any, Optional, Dict
from loguru import logger
from pydantic import BaseModel

from backend.core.task_runtime import TaskRuntimeContext
from backend.core.task_control import TaskCancelRequested, TaskPauseRequested
from backend.models.task_message import TaskMessageParams



class BackgroundTaskRunner:
    """
    A reusable runner for background tasks that:
    1. Updates task status to 'running'
    2. Creates a thread-safe progress callback
    3. Runs the blocking worker function in an executor
    4. Updates task status to 'completed' or 'failed'
    """

    def __init__(self, task_manager):
        self._task_manager = task_manager

    async def run(
        self,
        task_id: str,
        worker_fn: Callable[..., Any],
        worker_kwargs: Dict[str, Any],
        start_message_code: str = "starting",
        start_message_params: TaskMessageParams | None = None,
        success_message_code: str = "completed",
        success_message_params: TaskMessageParams | None = None,
        result_transformer: Optional[Callable[[Any], Any]] = None,
        progress_key: str = "progress_callback"
    ):
        """
        Execute a blocking worker function as a background task.
        
        Args:
            task_id: The task ID to track progress
            worker_fn: The blocking function to run (e.g., asr_service.transcribe)
            worker_kwargs: Keyword arguments to pass to worker_fn
            start_message_code: Stable message code displayed when the task starts
            start_message_params: Interpolation params for the start message
            success_message_code: Stable message code displayed on completion
            success_message_params: Interpolation params for the completion message
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
            runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
            # 1. Update status to running
            await runtime.update(
                status="running", 
                cancelled=False,
                message_code=start_message_code,
                message_params=start_message_params or {},
            )
            
            # 2. Create thread-safe progress callback
            loop = runtime.loop
            task_manager = runtime.task_manager
            
            def progress_callback(
                progress: int,
                message_code: str,
                message_params: TaskMessageParams | None = None,
            ):
                with progress_gate:
                    if not accept_progress_updates:
                        return
                    runtime.checkpoint()
                    if loop.is_closed():
                        return
                    future = task_manager.submit_threadsafe_update(
                        loop,
                        task_id,
                        progress=float(progress),
                        message_code=message_code,
                        message_params=message_params or {},
                    )
                    if future is not None:
                        progress_futures.append(future)
            
            # Inject progress callback into worker kwargs
            worker_kwargs[progress_key] = progress_callback
            
            # 3. Run blocking function in executor
            result = await runtime.run_blocking(lambda: worker_fn(**worker_kwargs))

            await flush_progress_updates()
            
            # 4. Transform result if needed
            final_result = result
            if result_transformer:
                final_result = result_transformer(result)
            elif isinstance(result, BaseModel):
                final_result = result.model_dump(mode="json")
            
            # 5. Update task as completed
            await runtime.update(
                status="completed",
                cancelled=False,
                progress=100.0,
                message_code=success_message_code,
                message_params=success_message_params or {},
                result=final_result
            )
            logger.success(f"Task {task_id} completed.")
            
        except TaskPauseRequested as e:
            await flush_progress_updates()
            logger.info(f"Task {task_id} paused: {e}")
            runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
            await runtime.mark_controlled_stop("pause", "paused", {})
        except TaskCancelRequested as e:
            await flush_progress_updates()
            logger.info(f"Task {task_id} cancelled: {e}")
            runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
            await runtime.mark_controlled_stop("cancel", "cancelled", {})
        except Exception as e:
            runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
            control_request = runtime.get_stop_request()
            if control_request in {"pause", "cancel"}:
                await flush_progress_updates()
                logger.info(f"Task {task_id} stopped cooperatively during failure path: {e}")
                await runtime.mark_controlled_stop(
                    control_request,
                    "paused" if control_request == "pause" else "cancelled",
                    {},
                )
                return
            logger.error(f"Task {task_id} failed: {e}")
            await runtime.update(
                status="failed",
                message_code="failed",
                message_params={},
                error=str(e)
            )

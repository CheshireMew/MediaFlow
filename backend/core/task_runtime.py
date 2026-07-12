import asyncio
from collections.abc import Callable
from typing import Any

from backend.models.task_message import TaskMessageParams, TaskProgressCallback


class TaskRuntimeContext:
    """Task execution boundary with an explicitly supplied task manager."""

    def __init__(self, task_id: str | None, *, task_manager, loop=None):
        self.task_id = task_id
        self.task_manager = task_manager
        self.loop = loop or asyncio.get_running_loop()

    def checkpoint(self) -> None:
        if self.task_id:
            self.task_manager.raise_if_control_requested(self.task_id)

    async def update(self, **kwargs) -> None:
        if self.task_id:
            await self.task_manager.update_task(self.task_id, **kwargs)

    async def mark_controlled_stop(
        self,
        request: str,
        message_code: str | None = None,
        message_params: TaskMessageParams | None = None,
    ) -> None:
        if self.task_id:
            await self.task_manager.mark_controlled_stop(
                self.task_id,
                request,
                message_code,
                message_params,
            )

    def get_stop_request(self) -> str | None:
        if not self.task_id:
            return None
        return self.task_manager.get_stop_request(self.task_id)

    def submit_progress(
        self,
        progress: float,
        message_code: str,
        message_params: TaskMessageParams | None = None,
    ) -> None:
        if not self.task_id:
            return
        self.checkpoint()
        if self.loop.is_closed():
            return
        self.task_manager.submit_threadsafe_update(
            self.loop,
            self.task_id,
            progress=progress,
            message_code=message_code,
            message_params=message_params or {},
        )

    def build_progress_callback(
        self,
        *,
        progress_transform: Callable[[Any], float] | None = None,
    ) -> TaskProgressCallback:
        transform = progress_transform or float

        def _callback(
            progress: Any,
            message_code: str,
            message_params: TaskMessageParams | None = None,
        ) -> None:
            self.submit_progress(transform(progress), message_code, message_params)

        return _callback

    async def run_blocking(self, worker: Callable[[], Any]) -> Any:
        return await self.loop.run_in_executor(None, worker)

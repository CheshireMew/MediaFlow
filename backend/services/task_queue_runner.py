import asyncio
from collections.abc import Awaitable, Callable

from loguru import logger

from backend.config import settings
from backend.core.task_control import TaskControlRequested
from backend.services.task_runtime_state import TaskRuntimeState

TaskRunner = Callable[[], Awaitable[None]]


class TaskQueueRunner:
    def __init__(
        self,
        runtime_state: TaskRuntimeState,
        *,
        max_concurrent: int | None = None,
    ):
        self._runtime_state = runtime_state
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._execution_specs: dict[str, TaskRunner] = {}
        self._workers: list[asyncio.Task] = []
        self._max_concurrent = max(1, max_concurrent or settings.TASK_MAX_CONCURRENT)

    @property
    def max_concurrent(self) -> int:
        return self._max_concurrent

    def is_running(self, task_id: str) -> bool:
        return task_id in self._runtime_state.running_ids

    def is_queued(self, task_id: str) -> bool:
        return task_id in self._runtime_state.queued_ids

    def running_count(self) -> int:
        return len(self._runtime_state.running_ids)

    def queued_count(self) -> int:
        return len(self._runtime_state.queued_ids)

    def request_delete_after_stop(self, task_id: str) -> None:
        self._runtime_state.mark_delete_after_stop(task_id)

    def register_runner(self, task_id: str, runner: TaskRunner) -> None:
        self._execution_specs[task_id] = runner

    def unqueue(self, task_id: str) -> None:
        self._runtime_state.unmark_queued(task_id)
        self._execution_specs.pop(task_id, None)

    def discard_task(self, task_id: str) -> None:
        self._runtime_state.unmark_queued(task_id)
        self._runtime_state.unmark_running(task_id)
        self._runtime_state.clear_delete_after_stop(task_id)
        self._execution_specs.pop(task_id, None)

    def clear(self) -> None:
        self._runtime_state.clear()
        self._execution_specs.clear()

    async def enqueue(self, task_id: str, runner: TaskRunner) -> None:
        self.prepare_enqueue(task_id, runner)
        await self.dispatch(task_id)

    def prepare_enqueue(self, task_id: str, runner: TaskRunner) -> None:
        self.register_runner(task_id, runner)
        self._runtime_state.mark_queued(task_id)

    async def dispatch(self, task_id: str) -> None:
        await self._queue.put(task_id)

    def start(self, task_manager) -> None:
        if self._workers:
            return
        for index in range(self._max_concurrent):
            self._workers.append(asyncio.create_task(self._worker_loop(task_manager, index)))
        logger.info(f"Started {len(self._workers)} task queue workers.")

    async def shutdown(self) -> None:
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        self._execution_specs.clear()

    async def _worker_loop(self, task_manager, worker_index: int) -> None:
        while True:
            task_id = await self._queue.get()
            self._runtime_state.unmark_queued(task_id)
            try:
                task = task_manager.get_task(task_id)
                if not task:
                    task_manager.clear_stop_request(task_id)
                    continue
                request = task_manager.get_stop_request(task_id)
                if request and task.status != "running":
                    message = "Paused in queue" if request == "pause" else "Cancelled in queue"
                    await task_manager.mark_controlled_stop(task_id, request, message)
                    continue
                if task.status != "pending":
                    continue

                runner = self._execution_specs.get(task_id)
                if not runner:
                    logger.warning(f"Skipping task {task_id}: no execution spec registered.")
                    await task_manager.update_task(
                        task_id,
                        status="failed",
                        message="Task execution spec is missing",
                        error="Task execution spec is missing",
                    )
                    continue

                self._runtime_state.mark_running(task_id)
                logger.info(f"[Queue:{worker_index}] Starting task {task_id}")
                await runner()
            except TaskControlRequested as e:
                logger.info(f"[Queue:{worker_index}] Task {task_id} stopped cooperatively: {e}")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception(f"[Queue:{worker_index}] Task {task_id} crashed: {e}")
                if task_manager.get_task(task_id):
                    await task_manager.update_task(
                        task_id,
                        status="failed",
                        message=str(e),
                        error=str(e),
                    )
            finally:
                self._runtime_state.unmark_running(task_id)
                self._execution_specs.pop(task_id, None)
                if task_id in self._runtime_state.delete_after_stop:
                    await task_manager.finalize_task_delete(task_id)
                self._queue.task_done()

import asyncio
import concurrent.futures
from collections.abc import Awaitable, Callable
from typing import Any, Dict, Optional, TYPE_CHECKING

from loguru import logger

from backend.config import settings
from backend.core.database import get_session_context, init_db
from backend.core.task_control import (
    TaskCancelRequested,
    TaskControlRequested,
    TaskPauseRequested,
)
from backend.models.task_model import Task
from backend.services.task_control_service import TaskControlService
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_queue_view import TaskQueueView
from backend.services.task_repository import TaskRepository
from backend.services.task_runtime_state import TaskRuntimeState

if TYPE_CHECKING:
    from backend.core.ws_notifier import WebSocketNotifier


class TaskManager:
    def __init__(
        self,
        *,
        repository: TaskRepository,
        event_publisher: TaskEventPublisher,
        queue_view: TaskQueueView,
        control_service: TaskControlService,
        runtime_state: TaskRuntimeState,
        notifier: Optional["WebSocketNotifier"] = None,
    ):
        self.tasks: Dict[str, Task] = {}
        resolved_notifier = notifier
        if resolved_notifier is None and event_publisher is not None:
            resolved_notifier = getattr(event_publisher, "_notifier", None)
        self._notifier: Optional["WebSocketNotifier"] = resolved_notifier
        self._repository = repository
        self._event_publisher = event_publisher
        self._queue_view = queue_view
        self._control_service = control_service
        self._runtime_state = runtime_state
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._queued_ids = self._runtime_state.queued_ids
        self._queued_order = self._runtime_state.queued_order
        self._running_ids = self._runtime_state.running_ids
        self._stop_requests: Dict[str, str] = self._runtime_state.stop_requests
        self._execution_specs: Dict[str, Callable[[], Awaitable[None]]] = {}
        self._delete_after_stop = self._runtime_state.delete_after_stop
        self._workers: list[asyncio.Task] = []
        self._threadsafe_update_futures: set[concurrent.futures.Future] = set()
        self._accept_threadsafe_updates = True
        self._max_concurrent = max(1, settings.TASK_MAX_CONCURRENT)
        self._startup_load_task: asyncio.Task | None = None

    async def init_async(self):
        """Initialize DB, load tasks, and start queue workers."""
        await init_db()
        self._start_workers()
        await self.load_tasks()

    async def warm_start_async(self):
        """
        Fast startup path for desktop packaging:
        initialize the DB and queue workers immediately, then load persisted
        tasks in the background so health checks can pass without waiting for a
        potentially large task table to be hydrated.
        """
        await init_db()
        self._start_workers()

        if self._startup_load_task and not self._startup_load_task.done():
            return

        self._startup_load_task = asyncio.create_task(self._load_tasks_background())

    async def shutdown_async(self):
        """Stop queue workers cleanly."""
        self._accept_threadsafe_updates = False
        if self._startup_load_task:
            self._startup_load_task.cancel()
            await asyncio.gather(self._startup_load_task, return_exceptions=True)
            self._startup_load_task = None
        await self.drain_threadsafe_updates()
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        self._runtime_state.clear()
        self._execution_specs.clear()
        self._threadsafe_update_futures.clear()
        self._accept_threadsafe_updates = True

    def submit_threadsafe_update(self, loop: asyncio.AbstractEventLoop, task_id: str, **kwargs):
        if not self._accept_threadsafe_updates or loop.is_closed():
            return None
        try:
            future = asyncio.run_coroutine_threadsafe(
                self.update_task(task_id, **kwargs),
                loop,
            )
        except RuntimeError:
            return None
        self._threadsafe_update_futures.add(future)

        def _cleanup(done_future):
            self._threadsafe_update_futures.discard(done_future)

        future.add_done_callback(_cleanup)
        return future

    async def drain_threadsafe_updates(self):
        pending = list(self._threadsafe_update_futures)
        for future in pending:
            try:
                await asyncio.wrap_future(future)
            except Exception:
                continue

    def _start_workers(self):
        if self._workers:
            return
        for index in range(self._max_concurrent):
            self._workers.append(asyncio.create_task(self._worker_loop(index)))
        logger.info(f"Started {len(self._workers)} task queue workers.")

    async def _worker_loop(self, worker_index: int):
        while True:
            task_id = await self._queue.get()
            self._runtime_state.unmark_queued(task_id)
            try:
                task = self.get_task(task_id)
                if not task:
                    self.clear_stop_request(task_id)
                    continue
                request = self.get_stop_request(task_id)
                if request and task.status != "running":
                    message = "Paused in queue" if request == "pause" else "Cancelled in queue"
                    await self.mark_controlled_stop(task_id, request, message)
                    continue
                if task.status != "pending":
                    continue

                runner = self._execution_specs.get(task_id)
                if not runner:
                    logger.warning(f"Skipping task {task_id}: no execution spec registered.")
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
            finally:
                self._runtime_state.unmark_running(task_id)
                if task_id in self._delete_after_stop:
                    await self._finalize_delete(task_id)
                self._queue.task_done()

    async def load_tasks(self):
        """Load tasks from DB on startup."""
        try:
            self.tasks = await self._repository.load_all()
            logger.info(f"Loaded {len(self.tasks)} tasks from SQLite.")
        except Exception as e:
            self.tasks.clear()
            logger.error(f"Failed to load tasks from DB: {e}")

    async def _load_tasks_background(self):
        try:
            await self.load_tasks()
            logger.info("Background task hydration completed.")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Background task hydration failed: {e}")

    def serialize_task(self, task: Task) -> dict:
        return self._queue_view.serialize_task(
            task,
            running_ids=self._running_ids,
            queued_ids=self._queued_ids,
            queued_order=self._queued_order,
        )

    def get_queue_summary(self) -> dict:
        return self._queue_view.get_queue_summary(
            self._max_concurrent,
            self._running_ids,
            self._queued_ids,
        )

    def get_tasks_snapshot(self) -> list:
        """Return serialized list of all tasks (for WebSocket snapshot)."""
        return [self.serialize_task(task) for task in self.tasks.values()]

    async def create_task(
        self,
        task_type: str,
        initial_message: str = "Pending...",
        request_params: Dict = None,
        task_name: str = None,
    ) -> str:
        new_task = await self._repository.create_task(
            task_type=task_type,
            initial_message=initial_message,
            request_params=request_params,
            task_name=task_name,
        )
        self.tasks[new_task.id] = new_task
        await self._event_publisher.publish_update(self.serialize_task(new_task))
        return new_task.id

    async def enqueue_task(
        self,
        task_id: str,
        runner: Callable[[], Awaitable[None]],
        queued_message: Optional[str] = None,
    ) -> None:
        self._execution_specs[task_id] = runner
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        if task_id in self._running_ids or task_id in self._queued_ids:
            return

        self.clear_stop_request(task_id)
        self._runtime_state.mark_queued(task_id)
        updates = {"status": "pending", "cancelled": False}
        if queued_message is not None:
            updates["message"] = queued_message
        await self.update_task(task_id, **updates)
        await self._queue.put(task_id)
        logger.info(f"Queued task {task_id}. pending={len(self._queued_ids)} running={len(self._running_ids)}")

    def has_stop_request(self, task_id: str) -> bool:
        return self._control_service.has_stop_request(self._stop_requests, task_id)

    def get_stop_request(self, task_id: str) -> Optional[str]:
        return self._control_service.get_stop_request(self._stop_requests, task_id)

    def clear_stop_request(self, task_id: str) -> None:
        self._control_service.clear_stop_request(self._stop_requests, task_id)

    def raise_if_control_requested(self, task_id: Optional[str]) -> None:
        if not task_id:
            return
        request = self.get_stop_request(task_id)
        if request == "pause":
            raise TaskPauseRequested("Task paused by user")
        if request == "cancel":
            raise TaskCancelRequested("Task cancelled by user")

    async def mark_controlled_stop(self, task_id: str, request: Optional[str], message: Optional[str] = None):
        await self._control_service.mark_controlled_stop(
            self,
            self._stop_requests,
            task_id,
            request,
            message=message,
        )

    async def update_task(self, task_id: str, **kwargs):
        updated_task = await self._repository.update_task(
            task_id,
            cached_task=self.tasks.get(task_id),
            **kwargs,
        )
        if updated_task:
            self.tasks[task_id] = updated_task
            await self._event_publisher.publish_update(self.serialize_task(updated_task))

    async def pause_task(self, task_id: str) -> bool:
        return await self._control_service.pause_task(self, task_id)

    async def cancel_task(self, task_id: str) -> bool:
        return await self._control_service.cancel_task(self, task_id)

    async def delete_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if task and task.status == "running":
            self._delete_after_stop.add(task_id)
            await self.cancel_task(task_id)
            logger.info(f"Task {task_id} scheduled for deletion after stop")
            return True

        if task and task.status in {"pending", "paused"}:
            self._queued_ids.discard(task_id)
            if task_id in self._queued_order:
                self._queued_order.remove(task_id)
            self._delete_after_stop.discard(task_id)
            self.clear_stop_request(task_id)
            self._execution_specs.pop(task_id, None)
            return await self._finalize_delete(task_id)

        return await self._finalize_delete(task_id)

    async def _finalize_delete(self, task_id: str) -> bool:
        task_exists = await self._repository.delete_task(task_id)
        if task_exists:
            self._queued_ids.discard(task_id)
            if task_id in self._queued_order:
                self._queued_order.remove(task_id)
            self._running_ids.discard(task_id)
            self.clear_stop_request(task_id)
            self._execution_specs.pop(task_id, None)
            self._delete_after_stop.discard(task_id)
            self.tasks.pop(task_id, None)

            await self._event_publisher.publish_delete(task_id)
            logger.info(f"Task {task_id} deleted")
            return True
        return False

    async def delete_all_tasks(self) -> int:
        count = await self._repository.delete_all_tasks()
        self.tasks.clear()
        self._runtime_state.clear()
        self._execution_specs.clear()

        await self._event_publisher.publish_snapshot([])
        logger.info(f"Deleted all {count} tasks")
        return count

    async def pause_all_tasks(self) -> int:
        count = 0
        priority = {"pending": 0, "paused": 1, "running": 2}
        for task in sorted(
            list(self.tasks.values()),
            key=lambda task: priority.get(task.status, 99),
        ):
            if task.status in {"pending", "running"}:
                changed = await self.pause_task(task.id)
                if changed:
                    count += 1
        return count

    async def cancel_all_tasks(self):
        cancelled_count = 0
        priority = {"pending": 0, "paused": 1, "running": 2}
        for task in sorted(
            list(self.tasks.values()),
            key=lambda task: priority.get(task.status, 99),
        ):
            if task.status in {"pending", "running", "paused"}:
                changed = await self.cancel_task(task.id)
                if changed:
                    cancelled_count += 1
        return cancelled_count

    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)

    def is_cancelled(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        return task.cancelled if task else False

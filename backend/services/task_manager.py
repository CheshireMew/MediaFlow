import asyncio
import concurrent.futures
import threading
from collections.abc import Awaitable, Callable
from typing import Dict, Optional

from loguru import logger

from backend.core.database import init_db
from backend.contracts import require_task_status_transition
from backend.core.task_control import (
    TaskCancelRequested,
    TaskPauseRequested,
)
from backend.models.task_contracts import TaskView
from backend.models.task_message import TaskMessageParams
from backend.models.task_model import Task
from backend.services.task_control_service import TaskControlService
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_queue_runner import TaskQueueRunner
from backend.services.task_queue_view import TaskQueueView
from backend.services.task_repository import TaskRepository
from backend.services.task_runtime_state import TaskRuntimeState

class TaskDeletionBlockedError(RuntimeError):
    def __init__(self, task_ids: set[str]):
        self.task_ids = set(task_ids)
        super().__init__(
            "Tasks are still stopping and were not deleted: "
            + ", ".join(sorted(self.task_ids))
        )


class TaskManager:
    def __init__(
        self,
        *,
        repository: TaskRepository,
        event_publisher: TaskEventPublisher,
        queue_view: TaskQueueView,
        control_service: TaskControlService,
        runtime_state: TaskRuntimeState,
    ):
        self.tasks: Dict[str, Task] = {}
        self._repository = repository
        self._event_publisher = event_publisher
        self._queue_view = queue_view
        self._control_service = control_service
        self._runtime_state = runtime_state
        self._stop_requests: Dict[str, str] = self._runtime_state.stop_requests
        self._queue_runner = TaskQueueRunner(self._runtime_state)
        self._threadsafe_update_futures: set[concurrent.futures.Future] = set()
        self._threadsafe_update_task_ids: dict[concurrent.futures.Future, str] = {}
        self._progress_update_lock = threading.Lock()
        self._pending_progress_updates: dict[str, dict] = {}
        self._progress_flush_futures: dict[str, concurrent.futures.Future] = {}
        self._accept_threadsafe_updates = True
        self._startup_load_task: asyncio.Task | None = None
        self._tasks_loaded = asyncio.Event()
        self._hydration_started = False
        self._startup_lock = asyncio.Lock()
        # A task update changes one logical record across SQLite, the in-memory
        # projection, history retention, and WebSocket clients. Keep that
        # transition atomic so a terminal state cannot be paired with an older
        # in-flight progress/control message.
        self._task_update_lock = asyncio.Lock()

    async def init_async(self):
        """Initialize DB, load tasks, and start queue workers."""
        async with self._startup_lock:
            if self._hydration_started and self._tasks_loaded.is_set():
                return
            await init_db()
            self._start_workers()
            self._hydration_started = True
            await self.load_runtime_tasks()

    async def warm_start_async(self):
        """
        Fast startup path for desktop packaging:
        initialize the DB and queue workers immediately, then load persisted
        tasks in the background so health checks can pass without waiting for a
        potentially large task table to be hydrated.
        """
        async with self._startup_lock:
            await self._warm_start_unlocked()

    async def ensure_started_async(self):
        if self._hydration_started:
            return
        await self.warm_start_async()

    async def _warm_start_unlocked(self):
        if self._hydration_started:
            return

        await init_db()
        self._start_workers()
        self._hydration_started = True
        self._tasks_loaded.clear()

        if self._startup_load_task and not self._startup_load_task.done():
            return

        self._startup_load_task = asyncio.create_task(self._load_runtime_tasks_background())

    async def shutdown_async(self):
        """Stop queue workers cleanly."""
        self._accept_threadsafe_updates = False
        if self._startup_load_task:
            self._startup_load_task.cancel()
            await asyncio.gather(self._startup_load_task, return_exceptions=True)
            self._startup_load_task = None
        await self.drain_threadsafe_updates()
        await self._queue_runner.shutdown()
        self._queue_runner.clear()
        with self._progress_update_lock:
            self._threadsafe_update_futures.clear()
            self._threadsafe_update_task_ids.clear()
            self._pending_progress_updates.clear()
            self._progress_flush_futures.clear()
        self._accept_threadsafe_updates = True
        self._tasks_loaded.clear()
        self._hydration_started = False

    def submit_threadsafe_update(self, loop: asyncio.AbstractEventLoop, task_id: str, **kwargs):
        if not self._accept_threadsafe_updates or loop.is_closed():
            return None
        with self._progress_update_lock:
            self._pending_progress_updates[task_id] = dict(kwargs)
            existing = self._progress_flush_futures.get(task_id)
            if existing is not None and not existing.done():
                return existing
            try:
                future = asyncio.run_coroutine_threadsafe(
                    self._flush_progress_updates(task_id),
                    loop,
                )
            except RuntimeError:
                self._pending_progress_updates.pop(task_id, None)
                return None
            self._progress_flush_futures[task_id] = future
            self._threadsafe_update_futures.add(future)
            self._threadsafe_update_task_ids[future] = task_id

        def _cleanup(done_future):
            with self._progress_update_lock:
                self._threadsafe_update_futures.discard(done_future)
                self._threadsafe_update_task_ids.pop(done_future, None)

        future.add_done_callback(_cleanup)
        return future

    async def _flush_progress_updates(self, task_id: str) -> None:
        while self._accept_threadsafe_updates:
            with self._progress_update_lock:
                payload = self._pending_progress_updates.pop(task_id, None)
                if payload is None:
                    self._progress_flush_futures.pop(task_id, None)
                    return
            await self.update_task(task_id, **payload)
            await asyncio.sleep(0.1)

        with self._progress_update_lock:
            self._pending_progress_updates.pop(task_id, None)
            self._progress_flush_futures.pop(task_id, None)

    async def drain_threadsafe_updates(self, task_id: str | None = None):
        with self._progress_update_lock:
            pending = [
                future
                for future in self._threadsafe_update_futures
                if task_id is None or self._threadsafe_update_task_ids.get(future) == task_id
            ]
        for future in pending:
            try:
                await asyncio.wrap_future(future)
            except Exception:
                continue

    def _start_workers(self):
        self._queue_runner.start(self)

    async def load_runtime_tasks(self):
        """Load restart-relevant tasks without hydrating historical task records."""
        loaded_successfully = False
        try:
            persisted_tasks = await self._repository.load_runtime_tasks()
            self.tasks = {**persisted_tasks, **self.tasks}
            logger.info(f"Loaded {len(persisted_tasks)} runtime tasks from SQLite.")
            loaded_successfully = True
        except Exception as e:
            logger.error(f"Failed to load runtime tasks from DB: {e}")
        finally:
            self._tasks_loaded.set()
        if loaded_successfully:
            await self._event_publisher.publish_snapshot(self.get_tasks_snapshot())

    async def _load_runtime_tasks_background(self):
        try:
            await self.load_runtime_tasks()
            logger.info("Background runtime task hydration completed.")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Background runtime task hydration failed: {e}")

    async def get_history_snapshot(self) -> list[TaskView]:
        await self.wait_until_tasks_loaded()
        persisted_tasks = await self._repository.load_history()
        merged_tasks = {**persisted_tasks, **self.tasks}
        return [
            self._queue_view.serialize_task(
                task,
                running_ids=self._runtime_state.running_ids,
                queued_ids=self._runtime_state.queued_ids,
                queued_order=self._runtime_state.queued_order,
            )
            for task in merged_tasks.values()
        ]

    def serialize_task(self, task: Task) -> TaskView:
        return self._queue_view.serialize_task(
            task,
            running_ids=self._runtime_state.running_ids,
            queued_ids=self._runtime_state.queued_ids,
            queued_order=self._runtime_state.queued_order,
        )

    def get_queue_summary(self) -> dict:
        return self._queue_view.get_queue_summary(
            self._queue_runner.max_concurrent,
            self._runtime_state.running_ids,
            self._runtime_state.queued_ids,
        )

    def get_tasks_snapshot(self) -> list[TaskView]:
        """Return serialized list of all tasks (for WebSocket snapshot)."""
        return [self.serialize_task(task) for task in self.tasks.values()]

    async def wait_until_tasks_loaded(self) -> None:
        await self.ensure_started_async()
        await self._tasks_loaded.wait()

    async def _wait_for_mutation_boundary(self) -> None:
        await self.wait_until_tasks_loaded()

    async def create_task(
        self,
        task_type: str,
        initial_message_code: str = "queued",
        initial_message_params: TaskMessageParams | None = None,
        request_params: Dict = None,
        task_name: str = None,
    ) -> str:
        await self._wait_for_mutation_boundary()
        new_task = await self._repository.create_task(
            task_type=task_type,
            initial_message_code=initial_message_code,
            initial_message_params=initial_message_params,
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
        queued_message_code: Optional[str] = None,
        queued_message_params: TaskMessageParams | None = None,
    ) -> None:
        await self._wait_for_mutation_boundary()
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        if self._queue_runner.is_running(task_id) or self._queue_runner.is_queued(task_id):
            return

        self.clear_stop_request(task_id)
        updates = {"status": "pending", "cancelled": False}
        if queued_message_code is not None:
            updates["message_code"] = queued_message_code
            updates["message_params"] = queued_message_params or {}
        self._queue_runner.prepare_enqueue(task_id, runner)
        try:
            await self.update_task(task_id, **updates)
        except Exception:
            self._queue_runner.discard_task(task_id)
            raise
        await self._queue_runner.dispatch(task_id)
        logger.info(
            f"Queued task {task_id}. "
            f"pending={self._queue_runner.queued_count()} "
            f"running={self._queue_runner.running_count()}"
        )

    def has_stop_request(self, task_id: str) -> bool:
        return self._control_service.has_stop_request(self._stop_requests, task_id)

    def get_stop_request(self, task_id: str) -> Optional[str]:
        return self._control_service.get_stop_request(self._stop_requests, task_id)

    def clear_stop_request(self, task_id: str) -> None:
        self._control_service.clear_stop_request(self._stop_requests, task_id)

    def set_stop_request(self, task_id: str, request: str) -> None:
        self._stop_requests[task_id] = request

    def is_task_running(self, task_id: str) -> bool:
        return self._queue_runner.is_running(task_id)

    def unqueue_task(self, task_id: str) -> None:
        self._queue_runner.unqueue(task_id)

    def raise_if_control_requested(self, task_id: Optional[str]) -> None:
        if not task_id:
            return
        request = self.get_stop_request(task_id)
        if request == "pause":
            raise TaskPauseRequested("Task paused by user")
        if request == "cancel":
            raise TaskCancelRequested("Task cancelled by user")

    async def mark_controlled_stop(
        self,
        task_id: str,
        request: Optional[str],
        message_code: Optional[str] = None,
        message_params: TaskMessageParams | None = None,
    ):
        await self._control_service.mark_controlled_stop(
            self,
            self._stop_requests,
            task_id,
            request,
            message_code=message_code,
            message_params=message_params,
        )

    async def update_task(self, task_id: str, **kwargs):
        await self.ensure_started_async()
        if kwargs.get("status") in {"completed", "failed", "cancelled", "paused"}:
            await self.drain_threadsafe_updates(task_id)
        async with self._task_update_lock:
            current_task = self.tasks.get(task_id)
            incoming_status = kwargs.get("status")
            if current_task is not None and incoming_status is not None:
                require_task_status_transition(current_task.status, str(incoming_status))
            updated_task = await self._repository.update_task(
                task_id,
                cached_task=self.tasks.get(task_id),
                **kwargs,
            )
            if updated_task:
                self.tasks[task_id] = updated_task
                pruned_task_ids: list[str] = []
                pruned_revisions: dict[str, int] = {}
                if updated_task.persistence_scope == "history":
                    pruned_revisions = await self._repository.trim_history()
                    pruned_task_ids = list(pruned_revisions)
                    for pruned_task_id in pruned_task_ids:
                        self.tasks.pop(pruned_task_id, None)

                if task_id not in pruned_task_ids:
                    await self._event_publisher.publish_update(self.serialize_task(updated_task))
                for pruned_task_id in pruned_task_ids:
                    await self._event_publisher.publish_delete(
                        pruned_task_id,
                        pruned_revisions.get(pruned_task_id, 1),
                    )

    async def pause_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        return await self._control_service.pause_task(self, task_id)

    async def cancel_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        return await self._control_service.cancel_task(self, task_id)

    async def delete_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        task = await self.get_task_record(task_id)
        if task and task.status in {"pending", "running", "paused"}:
            await self.cancel_task(task_id)
            remaining = await self._queue_runner.wait_until_stopped(
                {task_id},
                timeout_seconds=10.0,
            )
            if remaining:
                raise TaskDeletionBlockedError(remaining)

        return await self.finalize_task_delete(
            task_id,
            delete_revision=int(task.revision if task else 0) + 1,
        )

    async def finalize_task_delete(
        self,
        task_id: str,
        *,
        delete_revision: int,
    ) -> bool:
        task_exists = await self._repository.delete_task(task_id)
        if task_exists:
            self._queue_runner.discard_task(task_id)
            self.clear_stop_request(task_id)
            self.tasks.pop(task_id, None)

            await self._event_publisher.publish_delete(task_id, delete_revision)
            logger.info(f"Task {task_id} deleted")
            return True
        return False

    async def delete_all_tasks(self) -> int:
        await self._wait_for_mutation_boundary()
        task_ids = set(self.tasks)
        for task in list(self.tasks.values()):
            if task.status in {"pending", "running", "paused"}:
                await self.cancel_task(task.id)
        remaining = await self._queue_runner.wait_until_stopped(
            task_ids,
            timeout_seconds=10.0,
        )
        if remaining:
            raise TaskDeletionBlockedError(remaining)
        delete_revisions = await self._repository.delete_all_tasks()
        count = len(delete_revisions)
        self.tasks.clear()
        self._queue_runner.clear()

        for task_id, revision in delete_revisions.items():
            await self._event_publisher.publish_delete(task_id, revision)
        logger.info(f"Deleted all {count} tasks")
        return count

    async def pause_all_tasks(self) -> int:
        await self._wait_for_mutation_boundary()
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
        await self._wait_for_mutation_boundary()
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

    async def get_task_record(self, task_id: str) -> Optional[Task]:
        await self.wait_until_tasks_loaded()
        return self.tasks.get(task_id) or await self._repository.get_task(task_id)

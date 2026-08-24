import asyncio
import concurrent.futures
import threading
import time
from collections.abc import Callable, MutableMapping

from loguru import logger

from backend.models.task_message import validate_task_message
from backend.models.task_model import Task
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_repository import TaskRepository


class TaskProgressCoordinator:
    """Coalesces worker-thread progress and owns its memory/SQLite checkpoint policy."""

    def __init__(
        self,
        *,
        repository: TaskRepository,
        event_publisher: TaskEventPublisher,
        get_tasks: Callable[[], MutableMapping[str, Task]],
        serialize_task: Callable[[Task], object],
        update_task: Callable[..., object],
        get_task_update_lock: Callable[[str], asyncio.Lock],
    ) -> None:
        self._repository = repository
        self._event_publisher = event_publisher
        self._get_tasks = get_tasks
        self._serialize_task = serialize_task
        self._update_task = update_task
        self._get_task_update_lock = get_task_update_lock
        self._threadsafe_update_futures: set[concurrent.futures.Future] = set()
        self._threadsafe_update_task_ids: dict[concurrent.futures.Future, str] = {}
        self._progress_update_lock = threading.Lock()
        self._pending_progress_updates: dict[str, dict] = {}
        self._progress_flush_futures: dict[str, concurrent.futures.Future] = {}
        self._last_progress_persisted_at: dict[str, float] = {}
        self._dirty_progress_task_ids: set[str] = set()
        self._accept_threadsafe_updates = True

    def submit_threadsafe_update(
        self,
        loop: asyncio.AbstractEventLoop,
        task_id: str,
        **kwargs,
    ):
        if not self._accept_threadsafe_updates or loop.is_closed():
            return None
        with self._progress_update_lock:
            if not self._accept_threadsafe_updates or loop.is_closed():
                return None
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
            await self._update_progress_projection(task_id, **payload)
            await asyncio.sleep(0.1)

        with self._progress_update_lock:
            self._pending_progress_updates.pop(task_id, None)
            self._progress_flush_futures.pop(task_id, None)

    async def _update_progress_projection(self, task_id: str, **kwargs) -> None:
        expected_fields = {"progress", "message_code", "message_params"}
        if set(kwargs) != expected_fields:
            await self._update_task(task_id, **kwargs)
            return

        async with self._get_task_update_lock(task_id):
            tasks = self._get_tasks()
            task = tasks.get(task_id)
            if task is None or task.status in {"completed", "failed", "cancelled", "paused"}:
                return
            message_code, message_params = validate_task_message(
                kwargs["message_code"],
                kwargs["message_params"],
            )
            task.progress = max(
                float(task.progress or 0.0),
                max(0.0, min(100.0, float(kwargs["progress"]))),
            )
            task.message_code = message_code
            task.message_params = message_params
            task.revision = int(task.revision or 0) + 1
            tasks[task_id] = task
            self._dirty_progress_task_ids.add(task_id)
            await self._event_publisher.publish_update(self._serialize_task(task))

            now = time.monotonic()
            last_persisted = self._last_progress_persisted_at.get(task_id, 0.0)
            if now - last_persisted < 1.0:
                return
            try:
                await self._repository.persist_task_snapshot(task)
            except Exception as exc:  # noqa: BLE001 - UI progress survives checkpoint failure
                logger.warning("Failed to checkpoint task {} progress: {}", task_id, exc)
                return
            self._last_progress_persisted_at[task_id] = now
            self._dirty_progress_task_ids.discard(task_id)

    async def stop_accepting_and_flush_pending(self) -> None:
        with self._progress_update_lock:
            self._accept_threadsafe_updates = False
            pending_updates = list(self._pending_progress_updates.items())
            self._pending_progress_updates.clear()
        for task_id, payload in pending_updates:
            await self._update_progress_projection(task_id, **payload)
        await self.drain_threadsafe_updates()

    async def checkpoint_dirty(self) -> None:
        tasks = self._get_tasks()
        for task_id in list(self._dirty_progress_task_ids):
            async with self._get_task_update_lock(task_id):
                task = tasks.get(task_id)
                if task is None:
                    self._dirty_progress_task_ids.discard(task_id)
                    continue
                try:
                    await self._repository.persist_task_snapshot(task)
                except Exception as exc:  # noqa: BLE001 - continue checkpointing other tasks
                    logger.warning(
                        "Failed to checkpoint task {} during shutdown: {}",
                        task_id,
                        exc,
                    )
                    continue
                self._dirty_progress_task_ids.discard(task_id)

    async def drain_threadsafe_updates(self, task_id: str | None = None) -> None:
        with self._progress_update_lock:
            pending = [
                future
                for future in self._threadsafe_update_futures
                if task_id is None or self._threadsafe_update_task_ids.get(future) == task_id
            ]
        for future in pending:
            try:
                await asyncio.wrap_future(future)
            except Exception as exc:  # noqa: BLE001 - worker failures are handled by task state
                logger.debug("Progress flush ended with an ignored worker error: {}", exc)
                continue

    def mark_persisted(self, task_id: str) -> None:
        self._dirty_progress_task_ids.discard(task_id)
        self._last_progress_persisted_at[task_id] = time.monotonic()

    def discard_task(self, task_id: str) -> None:
        self._dirty_progress_task_ids.discard(task_id)
        self._last_progress_persisted_at.pop(task_id, None)

    def clear_task_tracking(self) -> None:
        self._dirty_progress_task_ids.clear()
        self._last_progress_persisted_at.clear()

    def reset_after_shutdown(self) -> None:
        with self._progress_update_lock:
            self._threadsafe_update_futures.clear()
            self._threadsafe_update_task_ids.clear()
            self._pending_progress_updates.clear()
            self._progress_flush_futures.clear()
            self._last_progress_persisted_at.clear()
            self._dirty_progress_task_ids.clear()
        self._accept_threadsafe_updates = True

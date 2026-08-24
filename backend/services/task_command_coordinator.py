from collections.abc import Awaitable, Callable, MutableMapping

from loguru import logger

from backend.models.application_errors import TaskDeletionBlockedError
from backend.models.task_model import Task
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_progress_coordinator import TaskProgressCoordinator
from backend.services.task_queue_runner import TaskQueueRunner
from backend.services.task_repository import TaskRepository


class TaskCommandCoordinator:
    """Owns bulk control and deletion commands after TaskManager's mutation boundary."""

    def __init__(
        self,
        *,
        repository: TaskRepository,
        event_publisher: TaskEventPublisher,
        queue_runner: TaskQueueRunner,
        progress: TaskProgressCoordinator,
        get_tasks: Callable[[], MutableMapping[str, Task]],
        get_task_record: Callable[[str], Awaitable[Task | None]],
        pause_task: Callable[[str], Awaitable[bool]],
        cancel_task: Callable[[str], Awaitable[bool]],
        clear_stop_request: Callable[[str], None],
        discard_task_lock: Callable[[str], None],
        clear_task_locks: Callable[[], None],
    ) -> None:
        self._repository = repository
        self._event_publisher = event_publisher
        self._queue_runner = queue_runner
        self._progress = progress
        self._get_tasks = get_tasks
        self._get_task_record = get_task_record
        self._pause_task = pause_task
        self._cancel_task = cancel_task
        self._clear_stop_request = clear_stop_request
        self._discard_task_lock = discard_task_lock
        self._clear_task_locks = clear_task_locks

    async def delete_task(self, task_id: str) -> bool:
        task = await self._get_task_record(task_id)
        if task and task.status in {"pending", "running", "paused"}:
            await self._cancel_task(task_id)
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
        if not task_exists:
            return False

        self._queue_runner.discard_task(task_id)
        self._clear_stop_request(task_id)
        self._get_tasks().pop(task_id, None)
        self._progress.discard_task(task_id)
        await self._event_publisher.publish_delete(task_id, delete_revision)
        self._discard_task_lock(task_id)
        logger.info("Task {} deleted", task_id)
        return True

    async def delete_all_tasks(self) -> int:
        tasks = self._get_tasks()
        task_ids = set(tasks)
        for task in list(tasks.values()):
            if task.status in {"pending", "running", "paused"}:
                await self._cancel_task(task.id)
        remaining = await self._queue_runner.wait_until_stopped(
            task_ids,
            timeout_seconds=10.0,
        )
        if remaining:
            raise TaskDeletionBlockedError(remaining)

        delete_revisions = await self._repository.delete_all_tasks()
        count = len(delete_revisions)
        tasks.clear()
        self._progress.clear_task_tracking()
        self._queue_runner.clear()
        self._clear_task_locks()
        for task_id, revision in delete_revisions.items():
            await self._event_publisher.publish_delete(task_id, revision)
        logger.info("Deleted all {} tasks", count)
        return count

    async def pause_all_tasks(self) -> int:
        count = 0
        priority = {"pending": 0, "paused": 1, "running": 2}
        for task in sorted(
            self._get_tasks().values(),
            key=lambda task: priority.get(task.status, 99),
        ):
            if task.status in {"pending", "running"} and await self._pause_task(task.id):
                count += 1
        return count

    async def cancel_all_tasks(self) -> int:
        cancelled_count = 0
        priority = {"pending": 0, "paused": 1, "running": 2}
        for task in sorted(
            self._get_tasks().values(),
            key=lambda task: priority.get(task.status, 99),
        ):
            if (
                task.status in {"pending", "running", "paused"}
                and await self._cancel_task(task.id)
            ):
                cancelled_count += 1
        return cancelled_count

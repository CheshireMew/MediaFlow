import asyncio
from collections.abc import Awaitable, Callable

from loguru import logger

from backend.contracts import require_task_status_transition
from backend.core.task_control import (
    TaskCancelRequested,
    TaskPauseRequested,
)
from backend.models.task_contracts import TaskSummaryView, TaskView
from backend.models.task_message import TaskMessageParams
from backend.models.task_model import Task
from backend.services.task_command_coordinator import TaskCommandCoordinator
from backend.services.task_control_service import TaskControlService
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_lifecycle_coordinator import TaskLifecycleCoordinator
from backend.services.task_progress_coordinator import TaskProgressCoordinator
from backend.services.task_queue_runner import TaskQueueRunner
from backend.services.task_queue_view import TaskQueueView
from backend.services.task_repository import TaskRepository
from backend.services.task_runtime_state import TaskRuntimeState


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
        self.tasks: dict[str, Task] = {}
        self._repository = repository
        self._event_publisher = event_publisher
        self._queue_view = queue_view
        self._control_service = control_service
        self._runtime_state = runtime_state
        self._stop_requests: dict[str, str] = self._runtime_state.stop_requests
        self._queue_runner = TaskQueueRunner(self._runtime_state)
        # Updates are ordered per task. Independent tasks must not wait on one
        # another's SQLite checkpoint or notification work.
        self._task_update_locks: dict[str, asyncio.Lock] = {}
        self._history_trim_lock = asyncio.Lock()
        self._progress = TaskProgressCoordinator(
            repository=repository,
            event_publisher=event_publisher,
            get_tasks=lambda: self.tasks,
            serialize_task=self.serialize_summary,
            update_task=self.update_task,
            get_task_update_lock=self._get_task_update_lock,
        )
        self._lifecycle = TaskLifecycleCoordinator(
            repository=repository,
            event_publisher=event_publisher,
            get_tasks=lambda: self.tasks,
            merge_tasks=self._merge_runtime_tasks,
            get_snapshot=self.get_tasks_snapshot,
            start_workers=self._start_workers,
        )
        self._commands = TaskCommandCoordinator(
            repository=repository,
            event_publisher=event_publisher,
            queue_runner=self._queue_runner,
            progress=self._progress,
            get_tasks=lambda: self.tasks,
            get_task_record=self.get_task_record,
            pause_task=self.pause_task,
            cancel_task=self.cancel_task,
            clear_stop_request=self.clear_stop_request,
            discard_task_lock=self._discard_task_update_lock,
            clear_task_locks=self._task_update_locks.clear,
        )

    def _get_task_update_lock(self, task_id: str) -> asyncio.Lock:
        return self._task_update_locks.setdefault(task_id, asyncio.Lock())

    def _discard_task_update_lock(self, task_id: str) -> None:
        lock = self._task_update_locks.get(task_id)
        if lock is not None and not lock.locked():
            self._task_update_locks.pop(task_id, None)

    async def init_async(self):
        """Initialize DB, load tasks, and start queue workers."""
        await self._lifecycle.init()

    async def warm_start_async(self):
        """
        Fast startup path for desktop packaging:
        initialize the DB and queue workers immediately, then load persisted
        tasks in the background so health checks can pass without waiting for a
        potentially large task table to be hydrated.
        """
        await self._lifecycle.warm_start()

    async def ensure_started_async(self):
        await self._lifecycle.ensure_started()

    async def shutdown_async(self):
        """Stop queue workers cleanly."""
        await self._lifecycle.stop()

        await self._progress.stop_accepting_and_flush_pending()
        await self._queue_runner.shutdown()
        await self._progress.checkpoint_dirty()
        await self._event_publisher.shutdown()
        self._queue_runner.clear()
        self._progress.reset_after_shutdown()
        self._task_update_locks.clear()

    def submit_threadsafe_update(
        self,
        loop: asyncio.AbstractEventLoop,
        task_id: str,
        **kwargs,
    ):
        return self._progress.submit_threadsafe_update(loop, task_id, **kwargs)

    async def drain_threadsafe_updates(self, task_id: str | None = None):
        await self._progress.drain_threadsafe_updates(task_id)

    def _start_workers(self):
        self._event_publisher.start()
        self._queue_runner.start(self)

    def _merge_runtime_tasks(self, persisted_tasks: dict[str, Task]) -> None:
        self.tasks = {**persisted_tasks, **self.tasks}

    async def load_runtime_tasks(self):
        await self._lifecycle.load_runtime_tasks()

    async def get_history_snapshot(self) -> list[TaskSummaryView]:
        await self.wait_until_tasks_loaded()
        persisted_tasks = await self._repository.load_history_summaries()
        summaries = [
            self._queue_view.serialize_summary(
                task,
                running_ids=self._runtime_state.running_ids,
                queued_ids=self._runtime_state.queued_ids,
                queued_order=self._runtime_state.queued_order,
            )
            for task in persisted_tasks
        ]
        summaries_by_id = {summary.id: summary for summary in summaries}
        for task in self.tasks.values():
            summaries_by_id[task.id] = self.serialize_summary(task)
        return sorted(
            summaries_by_id.values(),
            key=lambda task: (task.created_at, task.id),
            reverse=True,
        )

    def serialize_summary(self, task: Task) -> TaskSummaryView:
        return self._queue_view.serialize_summary(
            task,
            running_ids=self._runtime_state.running_ids,
            queued_ids=self._runtime_state.queued_ids,
            queued_order=self._runtime_state.queued_order,
        )

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
            tasks=self.tasks,
        )

    def get_tasks_snapshot(self) -> list[TaskSummaryView]:
        """Return serialized list of all tasks (for WebSocket snapshot)."""
        return [self.serialize_summary(task) for task in self.tasks.values()]

    async def wait_until_tasks_loaded(self) -> None:
        await self._lifecycle.wait_until_loaded()

    async def _wait_for_mutation_boundary(self) -> None:
        await self.wait_until_tasks_loaded()

    async def create_task(
        self,
        task_type: str,
        initial_message_code: str = "queued",
        initial_message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
        task_name: str | None = None,
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
        await self._event_publisher.publish_update(self.serialize_summary(new_task))
        return new_task.id

    async def enqueue_task(
        self,
        task_id: str,
        runner: Callable[[], Awaitable[None]],
        queued_message_code: str | None = None,
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

    async def begin_task_execution(self, task_id: str) -> bool:
        """Move one task from persisted pending/queued state to running atomically."""
        async with self._get_task_update_lock(task_id):
            task = self.tasks.get(task_id)
            if task is None or task.status != "pending":
                return False

            require_task_status_transition(task.status, "running")
            updated_task = await self._repository.update_task(
                task_id,
                cached_task=task,
                status="running",
                cancelled=False,
                message_code="pipeline_starting",
                message_params={},
            )
            if updated_task is None:
                return False

            self.tasks[task_id] = updated_task
            self._runtime_state.unmark_queued(task_id)
            self._runtime_state.mark_running(task_id)
            self._progress.mark_persisted(task_id)
            await self._event_publisher.publish_update(self.serialize_summary(updated_task))
            await self._publish_queue_positions()
            return True

    def has_stop_request(self, task_id: str) -> bool:
        return self._control_service.has_stop_request(self._stop_requests, task_id)

    def get_stop_request(self, task_id: str) -> str | None:
        return self._control_service.get_stop_request(self._stop_requests, task_id)

    def clear_stop_request(self, task_id: str) -> None:
        self._control_service.clear_stop_request(self._stop_requests, task_id)

    def set_stop_request(self, task_id: str, request: str) -> None:
        self._stop_requests[task_id] = request

    def is_task_running(self, task_id: str) -> bool:
        return self._queue_runner.is_running(task_id)

    async def unqueue_task(self, task_id: str) -> None:
        self._queue_runner.unqueue(task_id)
        await self._publish_queue_positions()

    async def _publish_queue_positions(self) -> None:
        await self._event_publisher.publish_queue_positions(
            list(self._runtime_state.queued_order)
        )

    def raise_if_control_requested(self, task_id: str | None) -> None:
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
        request: str | None,
        message_code: str | None = None,
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
        async with self._get_task_update_lock(task_id):
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
                self._progress.mark_persisted(task_id)
                pruned_task_ids: list[str] = []
                pruned_revisions: dict[str, int] = {}
                if updated_task.persistence_scope == "history":
                    async with self._history_trim_lock:
                        pruned_revisions = await self._repository.trim_history()
                        pruned_task_ids = list(pruned_revisions)
                        for pruned_task_id in pruned_task_ids:
                            self.tasks.pop(pruned_task_id, None)
                            self._progress.discard_task(pruned_task_id)

                if task_id not in pruned_task_ids:
                    await self._event_publisher.publish_update(
                        self.serialize_summary(updated_task)
                    )
                for pruned_task_id in pruned_task_ids:
                    await self._event_publisher.publish_delete(
                        pruned_task_id,
                        pruned_revisions.get(pruned_task_id, 1),
                    )
                    self._discard_task_update_lock(pruned_task_id)

    async def pause_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        return await self._control_service.pause_task(self, task_id)

    async def cancel_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        return await self._control_service.cancel_task(self, task_id)

    async def delete_task(self, task_id: str) -> bool:
        await self._wait_for_mutation_boundary()
        return await self._commands.delete_task(task_id)

    async def finalize_task_delete(
        self,
        task_id: str,
        *,
        delete_revision: int,
    ) -> bool:
        return await self._commands.finalize_task_delete(
            task_id,
            delete_revision=delete_revision,
        )

    async def delete_all_tasks(self) -> int:
        await self._wait_for_mutation_boundary()
        return await self._commands.delete_all_tasks()

    async def pause_all_tasks(self) -> int:
        await self._wait_for_mutation_boundary()
        return await self._commands.pause_all_tasks()

    async def cancel_all_tasks(self) -> int:
        await self._wait_for_mutation_boundary()
        return await self._commands.cancel_all_tasks()

    def get_task(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id)

    async def get_task_record(self, task_id: str) -> Task | None:
        await self.wait_until_tasks_loaded()
        return self.tasks.get(task_id) or await self._repository.get_task(task_id)

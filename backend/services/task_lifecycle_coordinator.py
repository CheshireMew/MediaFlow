import asyncio
from collections.abc import Callable, MutableMapping

from loguru import logger

from backend.core.database import init_db
from backend.models.task_model import Task
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_repository import TaskRepository


class TaskLifecycleCoordinator:
    """Owns task-system startup readiness and persisted runtime hydration."""

    def __init__(
        self,
        *,
        repository: TaskRepository,
        event_publisher: TaskEventPublisher,
        get_tasks: Callable[[], MutableMapping[str, Task]],
        merge_tasks: Callable[[dict[str, Task]], None],
        get_snapshot: Callable[[], list],
        start_workers: Callable[[], None],
    ) -> None:
        self._repository = repository
        self._event_publisher = event_publisher
        self._get_tasks = get_tasks
        self._merge_tasks = merge_tasks
        self._get_snapshot = get_snapshot
        self._start_workers = start_workers
        self._startup_load_task: asyncio.Task | None = None
        self._tasks_loaded = asyncio.Event()
        self._hydration_started = False
        self._startup_lock = asyncio.Lock()

    async def init(self) -> None:
        async with self._startup_lock:
            if self._hydration_started and self._tasks_loaded.is_set():
                return
            await init_db()
            self._start_workers()
            self._hydration_started = True
            await self.load_runtime_tasks()

    async def warm_start(self) -> None:
        async with self._startup_lock:
            if self._hydration_started:
                return
            await init_db()
            self._start_workers()
            self._hydration_started = True
            self._tasks_loaded.clear()
            self._startup_load_task = asyncio.create_task(
                self._load_runtime_tasks_background()
            )

    async def ensure_started(self) -> None:
        if not self._hydration_started:
            await self.warm_start()

    async def load_runtime_tasks(self) -> None:
        loaded_successfully = False
        try:
            persisted_tasks = await self._repository.load_runtime_tasks()
            self._merge_tasks(persisted_tasks)
            logger.info("Loaded {} runtime tasks from SQLite.", len(persisted_tasks))
            loaded_successfully = True
        except Exception as exc:
            logger.error("Failed to load runtime tasks from DB: {}", exc)
        finally:
            self._tasks_loaded.set()
        if loaded_successfully:
            await self._event_publisher.publish_snapshot(self._get_snapshot())

    async def _load_runtime_tasks_background(self) -> None:
        try:
            await self.load_runtime_tasks()
            logger.info("Background runtime task hydration completed.")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Background runtime task hydration failed: {}", exc)

    async def wait_until_loaded(self) -> None:
        await self.ensure_started()
        await self._tasks_loaded.wait()

    async def stop(self) -> None:
        if self._startup_load_task:
            self._startup_load_task.cancel()
            await asyncio.gather(self._startup_load_task, return_exceptions=True)
            self._startup_load_task = None
        self._tasks_loaded.clear()
        self._hydration_started = False

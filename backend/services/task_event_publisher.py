import asyncio
from contextlib import suppress
from typing import Protocol

from loguru import logger

from backend.models.task_contracts import TaskSummaryView

_COALESCED_PROGRESS_CODES = {
    "download_progress",
    "transcription_progress",
    "asr_chunks_progress",
    "translation_batch_progress",
    "synthesis_encoding",
    "clip_exporting",
}


class TaskEventNotifier(Protocol):
    async def broadcast(self, message: dict) -> None: ...


def task_event_payload(task: TaskSummaryView) -> dict:
    """Project a task to the lightweight real-time event contract."""
    return task.model_dump(mode="json")


class TaskEventPublisher:
    def __init__(self, notifier: TaskEventNotifier | None = None):
        self._notifier = notifier
        self._queue: asyncio.Queue[str] | None = None
        self._pending: dict[str, dict] = {}
        self._scheduled: set[str] = set()
        self._worker: asyncio.Task | None = None
        self._accepting = True

    def start(self) -> None:
        if not self._notifier or (self._worker and not self._worker.done()):
            return
        self._queue = asyncio.Queue()
        self._pending.clear()
        self._scheduled.clear()
        self._accepting = True
        self._worker = asyncio.create_task(self._dispatch_loop())

    def _enqueue(self, key: str, message: dict) -> None:
        if not self._notifier or not self._accepting:
            return
        if self._worker is None or self._worker.done():
            self.start()
        if self._queue is None:
            return
        self._pending[key] = message
        if key not in self._scheduled:
            self._scheduled.add(key)
            self._queue.put_nowait(key)

    async def _dispatch_loop(self) -> None:
        assert self._queue is not None
        while True:
            key = await self._queue.get()
            try:
                message = self._pending.pop(key, None)
                self._scheduled.discard(key)
                if message is not None and self._notifier is not None:
                    await self._notifier.broadcast(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - one notifier must not stop the queue
                logger.warning("Failed to publish task event {}: {}", key, exc)
            finally:
                self._queue.task_done()

    async def publish_update(self, task_payload: TaskSummaryView) -> None:
        key = (
            f"progress:{task_payload.id}"
            if task_payload.message_code in _COALESCED_PROGRESS_CODES
            else f"task:{task_payload.id}:{task_payload.revision}:update"
        )
        self._enqueue(
            key,
            {"type": "update", "task": task_event_payload(task_payload)},
        )

    async def publish_delete(self, task_id: str, revision: int) -> None:
        self._enqueue(
            f"task:{task_id}:{revision}:delete",
            {"type": "delete", "task_id": task_id, "revision": revision},
        )

    async def publish_snapshot(self, tasks_payload: list[TaskSummaryView]) -> None:
        self._enqueue(
            "snapshot",
            {
                "type": "snapshot",
                "tasks": [task_event_payload(task) for task in tasks_payload],
            },
        )

    async def publish_queue_positions(self, queued_order: list[str]) -> None:
        """Publish the latest queue ordering without rebuilding task payloads.

        Queue positions for every waiting task change whenever the head of the
        queue starts, pauses, or is cancelled.  The latest complete mapping can
        safely replace an older pending mapping, so this event is deliberately
        coalesced under one key.
        """
        self._enqueue(
            "queue_positions",
            {
                "type": "queue_positions",
                "positions": {
                    task_id: position
                    for position, task_id in enumerate(queued_order, start=1)
                },
            },
        )

    async def flush(self) -> None:
        if self._queue is not None:
            await self._queue.join()

    async def shutdown(self) -> None:
        self._accepting = False
        await self.flush()
        if self._worker is not None:
            self._worker.cancel()
            with suppress(asyncio.CancelledError):
                await self._worker
        self._worker = None
        self._queue = None
        self._pending.clear()
        self._scheduled.clear()

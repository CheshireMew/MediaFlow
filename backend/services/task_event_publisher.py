from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from backend.core.ws_notifier import WebSocketNotifier


class TaskEventPublisher:
    def __init__(self, notifier: Optional["WebSocketNotifier"] = None):
        self._notifier = notifier

    def set_notifier(self, notifier: "WebSocketNotifier") -> None:
        self._notifier = notifier

    async def publish_update(self, task_payload: dict) -> None:
        if self._notifier:
            await self._notifier.broadcast({"type": "update", "task": task_payload})

    async def publish_delete(self, task_id: str) -> None:
        if self._notifier:
            await self._notifier.broadcast({"type": "delete", "task_id": task_id})

    async def publish_snapshot(self, tasks_payload: list[dict]) -> None:
        if self._notifier:
            await self._notifier.broadcast({"type": "snapshot", "tasks": tasks_payload})

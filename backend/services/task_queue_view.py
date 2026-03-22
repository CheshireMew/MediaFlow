from typing import Optional

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.models.task_model import Task
from backend.services.task_media_contract import normalize_task_media_contract


class TaskQueueView:
    @staticmethod
    def get_persistence_scope(task: Task) -> str:
        return "runtime" if task.status in {"pending", "running", "paused", "processing_result"} else "history"

    @staticmethod
    def get_lifecycle(task: Task) -> str:
        if task.status in {"pending", "running", "paused", "processing_result"}:
            return TASK_LIFECYCLE["resumable"]
        return TASK_LIFECYCLE["history_only"]

    @staticmethod
    def get_queue_position(task_id: str, queued_ids: set[str], queued_order: list[str]) -> Optional[int]:
        if task_id not in queued_ids:
            return None
        for index, queued_id in enumerate(queued_order, start=1):
            if queued_id == task_id:
                return index
        return None

    def serialize_task(
        self,
        task: Task,
        *,
        running_ids: set[str],
        queued_ids: set[str],
        queued_order: list[str],
    ) -> dict:
        data = task.model_dump(mode="json")
        queue_state = "idle"
        queue_position = None

        if task.status == "paused":
            queue_state = "paused"
        elif task.status == "cancelled":
            queue_state = "cancelled"
        elif task.status == "completed":
            queue_state = "completed"
        elif task.status == "failed":
            queue_state = "failed"
        elif task.id in running_ids or task.status == "running":
            queue_state = "running"
        elif task.id in queued_ids or task.status == "pending":
            queue_state = "queued"
            queue_position = self.get_queue_position(task.id, queued_ids, queued_order)

        data["queue_state"] = queue_state
        data["queue_position"] = queue_position
        normalized_from_legacy = normalize_task_media_contract(data)
        data["task_source"] = "backend"
        data["task_contract_version"] = TASK_CONTRACT_VERSION
        data["task_contract_normalized_from_legacy"] = normalized_from_legacy
        data["persistence_scope"] = self.get_persistence_scope(task)
        data["lifecycle"] = self.get_lifecycle(task)
        return data

    @staticmethod
    def get_queue_summary(max_concurrent: int, running_ids: set[str], queued_ids: set[str]) -> dict:
        return {
            "max_concurrent": max_concurrent,
            "running": len(running_ids),
            "queued": len(queued_ids),
        }

from typing import Optional

from backend.contracts import task_queue_state
from backend.models.task_contracts import TaskView
from backend.models.task_model import Task
from backend.services.task_projection import primary_operation, task_artifacts


class TaskQueueView:
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
    ) -> TaskView:
        data = task.model_dump(mode="json")
        queue_state = task_queue_state(task.status)
        queue_position = None

        if queue_state in {"queued", "running"} and task.id in running_ids:
            queue_state = "running"
        elif queue_state in {"queued", "running"} and task.id in queued_ids:
            queue_state = "queued"
            queue_position = self.get_queue_position(task.id, queued_ids, queued_order)

        data["queue_state"] = queue_state
        data["queue_position"] = queue_position
        data["primary_operation"] = primary_operation(task.type, task.request_params)
        data["artifacts"] = [
            artifact.model_dump(mode="json")
            for artifact in task_artifacts(
                request_params=task.request_params,
                result=task.result,
            )
        ]
        return TaskView.model_validate(data)

    @staticmethod
    def get_queue_summary(max_concurrent: int, running_ids: set[str], queued_ids: set[str]) -> dict:
        return {
            "max_concurrent": max_concurrent,
            "running": len(running_ids),
            "queued": len(queued_ids),
        }

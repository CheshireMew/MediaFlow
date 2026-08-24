from collections.abc import Mapping
from typing import Any

from backend.contracts import task_queue_state
from backend.models.media_contracts import TaskArtifact
from backend.models.task_contracts import TaskSummaryView, TaskView
from backend.models.task_model import Task
from backend.services.task_projection import primary_operation, task_artifacts


class TaskQueueView:
    @staticmethod
    def _value(task: Task | Mapping[str, Any], name: str, default=None):
        if isinstance(task, Mapping):
            return task.get(name, default)
        return getattr(task, name, default)

    @staticmethod
    def get_queue_position(task_id: str, queued_ids: set[str], queued_order: list[str]) -> int | None:
        if task_id not in queued_ids:
            return None
        for index, queued_id in enumerate(queued_order, start=1):
            if queued_id == task_id:
                return index
        return None

    def serialize_summary(
        self,
        task: Task | Mapping[str, Any],
        *,
        running_ids: set[str],
        queued_ids: set[str],
        queued_order: list[str],
    ) -> TaskSummaryView:
        if isinstance(task, Task) and not task.primary_operation:
            task.primary_operation = primary_operation(task.type, task.request_params)
            task.summary_artifacts = [
                artifact.model_dump(mode="json")
                for artifact in task_artifacts(
                    request_params=task.request_params,
                    result=task.result,
                )
            ]
        task_id = str(self._value(task, "id"))
        status = str(self._value(task, "status"))
        queue_state = task_queue_state(status)
        queue_position = None

        if queue_state in {"queued", "running"} and task_id in running_ids:
            queue_state = "running"
        elif queue_state in {"queued", "running"} and task_id in queued_ids:
            queue_state = "queued"
            queue_position = self.get_queue_position(task_id, queued_ids, queued_order)

        raw_artifacts = self._value(task, "summary_artifacts", []) or []
        artifacts = [
            TaskArtifact.model_validate(artifact)
            for artifact in raw_artifacts
        ]
        return TaskSummaryView(
            id=task_id,
            type=str(self._value(task, "type")),
            status=status,
            task_source=self._value(task, "task_source"),
            task_contract_version=int(self._value(task, "task_contract_version")),
            persistence_scope=str(self._value(task, "persistence_scope")),
            lifecycle=str(self._value(task, "lifecycle")),
            progress=float(self._value(task, "progress", 0.0) or 0.0),
            revision=int(self._value(task, "revision", 0) or 0),
            name=self._value(task, "name"),
            message_code=self._value(task, "message_code"),
            message_params=self._value(task, "message_params", {}) or {},
            error=self._value(task, "error"),
            primary_operation=str(
                self._value(task, "primary_operation") or self._value(task, "type")
            ),
            artifacts=artifacts,
            created_at=int(self._value(task, "created_at")),
            queue_state=queue_state,
            queue_position=queue_position,
        )

    def serialize_task(
        self,
        task: Task,
        *,
        running_ids: set[str],
        queued_ids: set[str],
        queued_order: list[str],
    ) -> TaskView:
        summary = self.serialize_summary(
            task,
            running_ids=running_ids,
            queued_ids=queued_ids,
            queued_order=queued_order,
        )
        return TaskView(
            **summary.model_dump(mode="python"),
            result=task.result,
            request_params=task.request_params,
        )

    @staticmethod
    def get_queue_summary(
        max_concurrent: int,
        running_ids: set[str],
        queued_ids: set[str],
        *,
        tasks: Mapping[str, Task] | None = None,
    ) -> dict:
        if tasks is not None:
            running_ids = {
                task_id
                for task_id in running_ids
                if (task := tasks.get(task_id)) is not None and task.status == "running"
            }
            queued_ids = {
                task_id
                for task_id in queued_ids
                if (task := tasks.get(task_id)) is not None and task.status == "pending"
            }
        return {
            "max_concurrent": max_concurrent,
            "running": len(running_ids),
            "queued": len(queued_ids),
        }

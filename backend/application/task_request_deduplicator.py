import json
from collections.abc import Iterable


class TaskRequestDeduplicator:
    @staticmethod
    def get_comparison_key(params: dict) -> str:
        return json.dumps(params, sort_keys=True, default=str, separators=(",", ":"))

    def find_existing_task(
        self,
        tasks: Iterable,
        task_type: str,
        request_params: dict,
    ) -> str | None:
        if not request_params:
            return None

        target_key = self.get_comparison_key(request_params)

        for task in tasks:
            if (
                task.type != task_type
                or task.status not in {"pending", "running", "paused"}
                or not task.request_params
            ):
                continue
            current_key = self.get_comparison_key(task.request_params)
            if current_key == target_key:
                return task.id
        return None

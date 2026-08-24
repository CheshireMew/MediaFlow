
from backend.models.task_message import TaskMessageParams


class TaskControlService:
    @staticmethod
    def has_stop_request(stop_requests: dict[str, str], task_id: str) -> bool:
        return task_id in stop_requests

    @staticmethod
    def get_stop_request(stop_requests: dict[str, str], task_id: str) -> str | None:
        return stop_requests.get(task_id)

    @staticmethod
    def clear_stop_request(stop_requests: dict[str, str], task_id: str) -> None:
        stop_requests.pop(task_id, None)

    async def mark_controlled_stop(
        self,
        task_manager,
        stop_requests: dict[str, str],
        task_id: str,
        request: str | None,
        message_code: str | None = None,
        message_params: TaskMessageParams | None = None,
    ) -> None:
        if request == "pause":
            await task_manager.update_task(
                task_id,
                status="paused",
                cancelled=False,
                message_code=message_code or "paused",
                message_params=message_params or {},
            )
        elif request == "cancel":
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message_code=message_code or "cancelled",
                message_params=message_params or {},
            )
        self.clear_stop_request(stop_requests, task_id)

    async def pause_task(self, task_manager, task_id: str) -> bool:
        task = task_manager.get_task(task_id)
        if not task:
            return False

        if task_manager.is_task_running(task_id) or task.status == "running":
            task_manager.set_stop_request(task_id, "pause")
            await task_manager.update_task(
                task_id,
                message_code="pause_requested",
                message_params={},
            )
            return True

        if task.status == "pending":
            task_manager.set_stop_request(task_id, "pause")
            await task_manager.unqueue_task(task_id)
            await task_manager.update_task(
                task_id,
                status="paused",
                cancelled=False,
                message_code="paused_in_queue",
                message_params={},
            )
            return True

        return task.status == "paused"

    async def cancel_task(self, task_manager, task_id: str) -> bool:
        task = task_manager.get_task(task_id)
        if not task:
            return False

        if task_manager.is_task_running(task_id) or task.status == "running":
            task_manager.set_stop_request(task_id, "cancel")
            await task_manager.update_task(
                task_id,
                message_code="cancellation_requested",
                message_params={},
            )
            return True

        if task.status == "pending":
            task_manager.set_stop_request(task_id, "cancel")
            await task_manager.unqueue_task(task_id)
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message_code="cancelled_in_queue",
                message_params={},
            )
            return True

        if task.status == "paused":
            task_manager.clear_stop_request(task_id)
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message_code="cancelled",
                message_params={},
            )
            return True

        return task.status == "cancelled"

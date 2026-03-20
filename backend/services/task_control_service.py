from typing import Optional


class TaskControlService:
    @staticmethod
    def has_stop_request(stop_requests: dict[str, str], task_id: str) -> bool:
        return task_id in stop_requests

    @staticmethod
    def get_stop_request(stop_requests: dict[str, str], task_id: str) -> Optional[str]:
        return stop_requests.get(task_id)

    @staticmethod
    def clear_stop_request(stop_requests: dict[str, str], task_id: str) -> None:
        stop_requests.pop(task_id, None)

    async def mark_controlled_stop(
        self,
        task_manager,
        stop_requests: dict[str, str],
        task_id: str,
        request: Optional[str],
        message: Optional[str] = None,
    ) -> None:
        if request == "pause":
            await task_manager.update_task(
                task_id,
                status="paused",
                cancelled=False,
                message=message or "Paused",
            )
        elif request == "cancel":
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message=message or "Cancelled",
            )
        self.clear_stop_request(stop_requests, task_id)

    async def pause_task(self, task_manager, task_id: str) -> bool:
        task = task_manager.get_task(task_id)
        if not task:
            return False

        if task.status == "pending":
            task_manager._queued_ids.discard(task_id)
            if task_id in task_manager._queued_order:
                task_manager._queued_order.remove(task_id)
            await task_manager.update_task(
                task_id,
                status="paused",
                cancelled=False,
                message="Paused in queue",
            )
            return True

        if task.status == "running":
            task_manager._stop_requests[task_id] = "pause"
            await task_manager.update_task(task_id, message="Pause requested...")
            return True

        return task.status == "paused"

    async def cancel_task(self, task_manager, task_id: str) -> bool:
        task = task_manager.get_task(task_id)
        if not task:
            return False

        if task.status == "pending":
            task_manager._queued_ids.discard(task_id)
            if task_id in task_manager._queued_order:
                task_manager._queued_order.remove(task_id)
            self.clear_stop_request(task_manager._stop_requests, task_id)
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message="Cancelled in queue",
            )
            return True

        if task.status == "running":
            task_manager._stop_requests[task_id] = "cancel"
            await task_manager.update_task(task_id, message="Cancellation requested...")
            return True

        if task.status == "paused":
            self.clear_stop_request(task_manager._stop_requests, task_id)
            await task_manager.update_task(
                task_id,
                status="cancelled",
                cancelled=True,
                message="Cancelled",
            )
            return True

        return task.status == "cancelled"

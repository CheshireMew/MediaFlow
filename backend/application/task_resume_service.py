from loguru import logger

from backend.models.task_message import TaskMessageParams


class TaskResumeService:
    async def reset_paused_task(
        self,
        task_manager,
        task_id: str,
        message_code: str = "resumed",
        message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
    ) -> None:
        updates = {
            "status": "pending",
            "message_code": message_code,
            "message_params": message_params or {},
            "error": None,
            "cancelled": False,
        }
        if request_params is not None:
            updates["request_params"] = request_params

        await task_manager.update_task(
            task_id,
            **updates,
        )
        logger.info(f"Paused task {task_id} reset for resume")

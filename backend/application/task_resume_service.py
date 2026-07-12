from loguru import logger

from backend.models.task_message import TaskMessageParams


class TaskResumeService:
    async def reset_task_for_reuse(
        self,
        task_manager,
        task_id: str,
        message_code: str = "resumed",
        message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
    ) -> None:
        updates = {
            "status": "pending",
            "progress": 0.0,
            "message_code": message_code,
            "message_params": message_params or {},
            "result": None,
            "error": None,
            "cancelled": False,
        }
        if request_params is not None:
            updates["request_params"] = request_params

        await task_manager.update_task(
            task_id,
            **updates,
        )
        logger.info(f"Task {task_id} reset for reuse")

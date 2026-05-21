from loguru import logger

from backend.core.tasks.registry import build_task_runner
from backend.models.task_model import task_timestamp_ms


class TaskResumeService:
    async def reset_task_for_reuse(
        self,
        task_manager,
        task_id: str,
        message: str = "Resuming...",
        request_params: dict | None = None,
    ) -> None:
        updates = {
            "status": "pending",
            "progress": 0.0,
            "message": message,
            "created_at": task_timestamp_ms(),
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

    def build_resume_runner(self, task) -> callable:
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")

        return build_task_runner(task)

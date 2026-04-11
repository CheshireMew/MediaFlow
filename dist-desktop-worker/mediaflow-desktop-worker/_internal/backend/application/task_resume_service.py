import time

from loguru import logger

from backend.core.tasks.registry import TaskHandlerRegistry


class TaskResumeService:
    async def reset_task_for_reuse(
        self,
        task_manager,
        task_id: str,
        message: str = "Resuming...",
    ) -> None:
        await task_manager.update_task(
            task_id,
            status="pending",
            progress=0.0,
            message=message,
            created_at=time.time(),
            result=None,
            error=None,
            cancelled=False,
        )
        logger.info(f"Task {task_id} reset for reuse")

    def build_resume_runner(self, task) -> callable:
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")

        handler = TaskHandlerRegistry.get(task.type)
        if not handler:
            raise ValueError(f"No handler found for task type: {task.type}")
        return handler.build_runner(task)

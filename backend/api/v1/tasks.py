from fastapi import APIRouter

from backend.models.application_errors import (
    ConflictError,
    ResourceNotFoundError,
)
from backend.models.task_contracts import (
    TaskCountActionResponse,
    TaskDeleteActionResponse,
    TaskQueueSummary,
    TaskResponse,
    TaskStatusActionResponse,
    TaskSummaryView,
    TaskView,
)


def create_router(*, task_manager, task_orchestrator) -> APIRouter:
    router = APIRouter(prefix="/tasks", tags=["Tasks"])

    @router.get("/queue/summary", response_model=TaskQueueSummary)
    async def get_queue_summary():
        return task_manager.get_queue_summary()

    @router.get("/", response_model=list[TaskSummaryView])
    async def list_tasks():
        return await task_manager.get_history_snapshot()

    @router.get("/{task_id}", response_model=TaskView)
    async def get_task(task_id: str):
        await task_manager.wait_until_tasks_loaded()
        task = await task_manager.get_task_record(task_id)
        if not task:
            raise ResourceNotFoundError("Task not found", code="task_not_found")
        return task_manager.serialize_task(task)

    @router.post("/pause-all", response_model=TaskCountActionResponse)
    async def pause_all_tasks():
        count = await task_manager.pause_all_tasks()
        return {
            "message_code": "pause_requested",
            "message_params": {"count": count},
            "count": count,
        }

    @router.post("/cancel-all", response_model=TaskCountActionResponse)
    async def cancel_all_tasks():
        count = await task_manager.cancel_all_tasks()
        return {
            "message_code": "cancellation_requested",
            "message_params": {"count": count},
            "count": count,
        }

    @router.post("/{task_id}/pause", response_model=TaskStatusActionResponse)
    async def pause_task(task_id: str):
        if not await task_manager.get_task_record(task_id):
            raise ResourceNotFoundError("Task not found", code="task_not_found")
        if not await task_manager.pause_task(task_id):
            raise ConflictError(
                "Task cannot be paused in its current state",
                code="task_pause_conflict",
            )
        return {
            "message_code": "pause_requested",
            "message_params": {},
            "status": "paused",
        }

    @router.post("/{task_id}/cancel", response_model=TaskStatusActionResponse)
    async def cancel_task(task_id: str):
        if not await task_manager.get_task_record(task_id):
            raise ResourceNotFoundError("Task not found", code="task_not_found")
        if not await task_manager.cancel_task(task_id):
            raise ConflictError(
                "Task cannot be cancelled in its current state",
                code="task_cancel_conflict",
            )
        return {
            "message_code": "cancellation_requested",
            "message_params": {},
            "status": "cancelled",
        }

    @router.post("/{task_id}/resume", response_model=TaskStatusActionResponse)
    async def resume_task(task_id: str):
        return await task_orchestrator.resume_task(task_id)

    @router.post("/{task_id}/retry", response_model=TaskResponse)
    async def retry_task(task_id: str):
        return await task_orchestrator.retry_task(task_id)

    @router.delete("/{task_id}", response_model=TaskDeleteActionResponse)
    async def delete_task(task_id: str):
        if not await task_manager.delete_task(task_id):
            raise ResourceNotFoundError("Task not found", code="task_not_found")
        return {
            "message_code": "deleted",
            "message_params": {},
            "task_id": task_id,
        }

    @router.delete("/", response_model=TaskCountActionResponse)
    async def delete_all_tasks():
        count = await task_manager.delete_all_tasks()
        return {
            "message_code": "deleted_count",
            "message_params": {"count": count},
            "count": count,
        }

    return router

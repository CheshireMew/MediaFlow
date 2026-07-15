from fastapi import APIRouter, HTTPException

from backend.models.task_contracts import TaskCountActionResponse, TaskDeleteActionResponse, TaskResponse, TaskQueueSummary, TaskStatusActionResponse, TaskView
from loguru import logger
from backend.services.task_manager import TaskDeletionBlockedError


def create_router(*, task_manager, task_orchestrator) -> APIRouter:
    router = APIRouter(prefix="/tasks", tags=["Tasks"])

    @router.get("/queue/summary", response_model=TaskQueueSummary)
    async def get_queue_summary():
        return task_manager.get_queue_summary()

    @router.get("/", response_model=list[TaskView])
    async def list_tasks():
        return await task_manager.get_history_snapshot()

    @router.get("/{task_id}", response_model=TaskView)
    async def get_task(task_id: str):
        await task_manager.wait_until_tasks_loaded()
        task = await task_manager.get_task_record(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
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
            raise HTTPException(status_code=404, detail="Task not found")
        if not await task_manager.pause_task(task_id):
            raise HTTPException(status_code=409, detail="Task cannot be paused in its current state")
        return {
            "message_code": "pause_requested",
            "message_params": {},
            "status": "paused",
        }

    @router.post("/{task_id}/cancel", response_model=TaskStatusActionResponse)
    async def cancel_task(task_id: str):
        if not await task_manager.get_task_record(task_id):
            raise HTTPException(status_code=404, detail="Task not found")
        if not await task_manager.cancel_task(task_id):
            raise HTTPException(status_code=409, detail="Task cannot be cancelled in its current state")
        return {
            "message_code": "cancellation_requested",
            "message_params": {},
            "status": "cancelled",
        }

    @router.post("/{task_id}/resume", response_model=TaskStatusActionResponse)
    async def resume_task(task_id: str):
        try:
            return await task_orchestrator.resume_task(task_id)
        except ValueError as e:
            detail = str(e)
            if detail == "Task not found":
                raise HTTPException(status_code=404, detail=detail)
            if detail == "Cannot resume task: Missing parameters":
                raise HTTPException(status_code=400, detail=detail)
            if detail == "Only paused tasks can be resumed":
                raise HTTPException(status_code=409, detail=detail)
            logger.error(f"Resume failed: {e}")
            raise HTTPException(status_code=500, detail=detail)
        except Exception as e:
            logger.error(f"Resume failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to restart task: {e}")

    @router.post("/{task_id}/retry", response_model=TaskResponse)
    async def retry_task(task_id: str):
        try:
            return await task_orchestrator.retry_task(task_id)
        except ValueError as e:
            detail = str(e)
            if detail == "Task not found":
                raise HTTPException(status_code=404, detail=detail)
            raise HTTPException(status_code=409, detail=detail)

    @router.delete("/{task_id}", response_model=TaskDeleteActionResponse)
    async def delete_task(task_id: str):
        try:
            if not await task_manager.delete_task(task_id):
                raise HTTPException(status_code=404, detail="Task not found")
        except TaskDeletionBlockedError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        return {
            "message_code": "deleted",
            "message_params": {},
            "task_id": task_id,
        }

    @router.delete("/", response_model=TaskCountActionResponse)
    async def delete_all_tasks():
        try:
            count = await task_manager.delete_all_tasks()
        except TaskDeletionBlockedError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        return {
            "message_code": "deleted_count",
            "message_params": {"count": count},
            "count": count,
        }

    return router

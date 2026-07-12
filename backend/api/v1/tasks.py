from fastapi import APIRouter, HTTPException

from backend.models.schemas import (
    TaskCountActionResponse,
    TaskDeleteActionResponse,
    TaskStatusActionResponse,
    TaskView,
)
from loguru import logger


def create_router(*, task_manager, task_orchestrator) -> APIRouter:
    router = APIRouter(prefix="/tasks", tags=["Tasks"])

    @router.get("/queue/summary", response_model=dict)
    async def get_queue_summary():
        return task_manager.get_queue_summary()

    @router.get("/", response_model=list[TaskView])
    async def list_tasks():
        return await task_manager.get_history_snapshot()

    @router.get("/{task_id}", response_model=TaskView)
    async def get_task(task_id: str):
        await task_manager.wait_until_tasks_loaded()
        task = task_manager.get_task(task_id)
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
        if not await task_manager.pause_task(task_id):
            raise HTTPException(status_code=404, detail="Task not found")
        return {
            "message_code": "pause_requested",
            "message_params": {},
            "status": "paused",
        }

    @router.post("/{task_id}/cancel", response_model=TaskStatusActionResponse)
    async def cancel_task(task_id: str):
        if not await task_manager.cancel_task(task_id):
            raise HTTPException(status_code=404, detail="Task not found")
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
            logger.error(f"Resume failed: {e}")
            raise HTTPException(status_code=500, detail=detail)
        except Exception as e:
            logger.error(f"Resume failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to restart task: {e}")

    @router.delete("/{task_id}", response_model=TaskDeleteActionResponse)
    async def delete_task(task_id: str):
        if not await task_manager.delete_task(task_id):
            raise HTTPException(status_code=404, detail="Task not found")
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

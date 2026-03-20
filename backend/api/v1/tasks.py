from fastapi import APIRouter, HTTPException

from backend.core.container import container, Services
from loguru import logger

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("/", response_model=list[dict])
async def list_tasks():
    """Get all tasks."""
    tm = container.get(Services.TASK_MANAGER)
    return [tm.serialize_task(task) for task in tm.tasks.values()]


@router.get("/queue/summary", response_model=dict)
async def get_queue_summary():
    """Get task queue runtime summary."""
    return container.get(Services.TASK_MANAGER).get_queue_summary()


@router.get("/{task_id}", response_model=dict)
async def get_task(task_id: str):
    """Get task status."""
    tm = container.get(Services.TASK_MANAGER)
    task = tm.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return tm.serialize_task(task)


@router.post("/pause-all")
async def pause_all_tasks():
    """Pause all active tasks."""
    count = await container.get(Services.TASK_MANAGER).pause_all_tasks()
    return {"message": f"Marked {count} tasks for pause", "count": count}


@router.post("/cancel-all")
async def cancel_all_tasks():
    """Cancel all active tasks."""
    count = await container.get(Services.TASK_MANAGER).cancel_all_tasks()
    return {"message": f"Marked {count} tasks for cancellation", "count": count}


@router.post("/{task_id}/pause")
async def pause_task(task_id: str):
    """Pause a queued task or cooperatively pause a running task."""
    success = await container.get(Services.TASK_MANAGER).pause_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Pause requested", "status": "paused"}

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a task."""
    success = await container.get(Services.TASK_MANAGER).cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Cancellation requested", "status": "cancelled"}


@router.post("/{task_id}/resume")
async def resume_task(task_id: str):
    """Resume a paused/cancelled/failed task."""
    try:
        return await container.get(Services.TASK_ORCHESTRATOR).resume_task(task_id)
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


@router.delete("/{task_id}")
async def delete_task(task_id: str):
    """Delete a task (remove from list)."""
    success = await container.get(Services.TASK_MANAGER).delete_task(task_id)
    if not success:
         raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted", "task_id": task_id}


@router.delete("/")
async def delete_all_tasks():
    """Delete ALL tasks."""
    count = await container.get(Services.TASK_MANAGER).delete_all_tasks()
    return {"message": f"Deleted {count} tasks", "count": count}

from fastapi import APIRouter, HTTPException, BackgroundTasks

from src.core.container import container, Services
from src.models.schemas import PipelineRequest, TranscribeRequest
from src.api.v1.transcribe import run_transcription_task

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


def _get_pipeline_runner():
    return container.get(Services.PIPELINE)


@router.post("/cancel-all")
async def cancel_all_tasks():
    """Cancel all active tasks."""
    count = await _get_task_manager().cancel_all_tasks()
    return {"message": f"Marked {count} tasks for cancellation", "count": count}


@router.post("/{task_id}/resume")
async def resume_task(task_id: str, background_tasks: BackgroundTasks):
    """Resume a paused/cancelled/failed task."""
    tm = _get_task_manager()
    task = tm.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if not task.request_params:
         raise HTTPException(status_code=400, detail="Cannot resume task: Missing parameters")

    if task.status == "running":
        return {"message": "Task is already running", "status": "running"}

    # Reset task state
    await tm.update_task(task_id, status="pending", message="Resuming...", error=None, result=None, cancelled=False)
    
    try:
        if task.type == "transcribe":
            req = TranscribeRequest(**task.request_params)
            background_tasks.add_task(run_transcription_task, task_id, req)
        else:
            # Default to pipeline/download
            req = PipelineRequest(**task.request_params)
            background_tasks.add_task(_get_pipeline_runner().run, req.steps, task_id)
            
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to restart task: {e}")

    return {"message": "Task resumed", "status": "pending"}


@router.delete("/{task_id}")
async def delete_task(task_id: str):
    """Delete a task (remove from list)."""
    success = await _get_task_manager().delete_task(task_id)
    if not success:
         raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted", "task_id": task_id}


@router.delete("/")
async def delete_all_tasks():
    """Delete ALL tasks."""
    count = await _get_task_manager().delete_all_tasks()
    return {"message": f"Deleted {count} tasks", "count": count}

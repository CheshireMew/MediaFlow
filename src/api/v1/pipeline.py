from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger

from src.models.schemas import PipelineRequest
from src.core.container import container, Services

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


def _get_pipeline_runner():
    return container.get(Services.PIPELINE)


@router.post("/run")
async def run_pipeline(req: PipelineRequest, background_tasks: BackgroundTasks):
    """
    Run a multi-step pipeline in the background.
    Returns a Task ID immediately. Progress can be tracked via WebSocket.
    """
    try:
        # Create Task
        # Store params for potential resume
        logger.info(f"Pipeline Request: task_name={req.task_name}, steps={len(req.steps)}")
        task_id = await _get_task_manager().create_task(
            "pipeline", 
            "Queued", 
            request_params=req.dict(), 
            task_name=req.task_name
        )
        
        # Run in background
        background_tasks.add_task(_get_pipeline_runner().run, req.steps, task_id)
        
        return {
            "task_id": task_id,
            "status": "pending",
            "message": "Task queued"
        }
    except Exception as e:
        logger.error(f"Pipeline submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

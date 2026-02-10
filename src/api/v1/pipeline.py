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
        tm = _get_task_manager()
        
        # 1. Deduplication Check
        existing_task_id = tm.find_task_by_params("pipeline", req.dict())
        
        if existing_task_id:
            task = tm.get_task(existing_task_id)
            if task:
                # Case A: Task is already running or pending (Debounce)
                if task.status in ["running", "pending"]:
                    logger.info(f"Duplicate task request ignored: {existing_task_id}")
                    return {
                        "task_id": existing_task_id,
                        "status": task.status,
                        "message": "Task already active"
                    }
                
                # Case B: Task is completed/failed/cancelled (Recycle)
                # Reset task state and re-queue backend work
                logger.info(f"Recycling existing task: {existing_task_id}")
                await tm.reset_task(existing_task_id)
                
                # Re-run logic
                background_tasks.add_task(_get_pipeline_runner().run, req.steps, existing_task_id)
                
                return {
                    "task_id": existing_task_id,
                    "status": "pending",
                    "message": "Task restarted (Recycled)"
                }

        # 2. Create New Task
        # Store params for potential resume
        # Determine Task Type
        task_type = "pipeline"
        if len(req.steps) == 1 and req.steps[0].step_name == "download":
            task_type = "download"

        logger.info(f"Pipeline Request: task_name={req.task_name}, steps={len(req.steps)}, type={task_type}")
        task_id = await tm.create_task(
            task_type, 
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

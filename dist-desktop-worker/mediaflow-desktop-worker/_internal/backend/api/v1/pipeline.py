from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.application.download_service import submit_download_pipeline
from backend.models.schemas import PipelineRequest
router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


@router.post("/run")
async def run_pipeline(req: PipelineRequest):
    """
    Run a multi-step pipeline in the background.
    Returns a Task ID immediately. Progress can be tracked via WebSocket.
    """
    try:
        return await submit_download_pipeline(req)
    except Exception as e:
        logger.error(f"Pipeline submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Data Models ---

class EnhanceRequest(BaseModel):
    video_path: str
    model: str = "RealESRGAN-x4plus"
    scale: str = "4x"

class CleanRequest(BaseModel):
    video_path: str
    roi: List[int] # [x, y, w, h]
    method: str = "telea"

class PreprocessingResponse(BaseModel):
    task_id: str
    status: str
    message: str

# --- Endpoints ---

@router.post("/enhance", response_model=PreprocessingResponse)
async def enhance_video(request: EnhanceRequest):
    """
    Stub endpoint for Video Enhancement (Super Resolution).
    Currently just mocks a task creation.
    """
    try:
        task_id = str(uuid.uuid4())
        logger.info(f"Mock Enhance Task Created: {task_id}, Model={request.model}, Path={request.video_path}")
        
        # In future: submit to TaskManager or Celery
        
        return PreprocessingResponse(
            task_id=task_id,
            status="queued",
            message=f"Enhancement task started with {request.model} ({request.scale})"
        )
    except Exception as e:
        logger.error(f"Enhance failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_video(request: CleanRequest):
    """
    Stub endpoint for Video Cleanup (Watermark Removal).
    Currently just mocks a task creation.
    """
    try:
        task_id = str(uuid.uuid4())
        logger.info(f"Mock Clean Task Created: {task_id}, Method={request.method}, ROI={request.roi}")
        
        return PreprocessingResponse(
            task_id=task_id,
            status="queued",
            message=f"Cleanup task started using {request.method}"
        )
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

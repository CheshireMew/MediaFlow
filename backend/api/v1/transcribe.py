from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.application.transcription_service import (
    execute_transcription_segment,
    submit_transcription_segment_task,
    submit_transcription_task,
    supported_kwargs,
)
from backend.core.runtime_access import RuntimeServices
from backend.models.schemas import TranscribeRequest, TranscribeSegmentRequest, TaskResponse
from backend.core.task_runner import BackgroundTaskRunner
from backend.utils.path_validator import validate_input_file

router = APIRouter(prefix="/transcribe", tags=["Transcription"])


@router.post("/", response_model=TaskResponse)
async def transcribe_audio(req: TranscribeRequest):
    """
    Start an asynchronous transcription task.
    Returns a Task ID to track progress.
    """
    logger.info(f"Received transcription request: {req.model_dump()}")
    try:
        if not req.audio_path:
            raise ValueError("audio path is required")
        req.audio_path = str(validate_input_file(req.audio_path, label="audio_path"))
        response = await submit_transcription_task(req)
        return TaskResponse(task_id=response["task_id"], status=response["status"])
    except ValueError as e:
        logger.warning(f"Rejected transcription request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/segment")
async def transcribe_segment(req: TranscribeSegmentRequest):
    """
    Transcribe a specific segment.
    Hybrid Strategy:
    - < 30s: Synchronous (returns result immediately)
    - > 30s: Asynchronous (returns task_id)
    """
    duration = req.end - req.start
    if duration <= 0:
        raise HTTPException(status_code=400, detail="Invalid duration")
    if not req.audio_path:
        raise HTTPException(status_code=400, detail="audio_path is required")
    try:
        req.audio_path = str(validate_input_file(req.audio_path, label="audio_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(f"Segment Transcription Request: {duration:.2f}s ({req.start}-{req.end})")

    # HYBRID STRATEGY
    if duration > 30:
        response = await submit_transcription_segment_task(req)
        
        return TaskResponse(task_id=response["task_id"], status="pending", message="Segment too long, processing in background")

    else:
        try:
            return await execute_transcription_segment(req)
        except HTTPException:
            raise
        except Exception as e:
             logger.error(f"Sync segment transcription failed: {e}")
             raise HTTPException(status_code=500, detail=str(e))

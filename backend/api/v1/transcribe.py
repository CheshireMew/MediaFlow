from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.application.task_operations import (
    run_task_operation,
    submit_task_operation,
)
from backend.models.schemas import TranscribeRequest, TranscribeSegmentRequest, TaskResponse
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
        validate_input_file(req.audio_ref.path, label="audio_ref.path")
        response = await submit_task_operation("transcribe", req)
        return TaskResponse(**response)
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
    try:
        validate_input_file(req.audio_ref.path, label="audio_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(f"Segment Transcription Request: {duration:.2f}s ({req.start}-{req.end})")

    # HYBRID STRATEGY
    if duration > 30:
        response = await submit_task_operation("transcribe_segment", req)
        return TaskResponse.model_validate(
            {**response, "message": "Segment too long, processing in background"}
        )

    else:
        try:
            return await run_task_operation("transcribe_segment", req)
        except HTTPException:
            raise
        except Exception as e:
             logger.error(f"Sync segment transcription failed: {e}")
             raise HTTPException(status_code=500, detail=str(e))

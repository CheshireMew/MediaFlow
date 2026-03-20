from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.schemas import TranscribeRequest, TaskResponse
from backend.core.task_runner import BackgroundTaskRunner
from backend.core.container import container, Services

router = APIRouter(prefix="/transcribe", tags=["Transcription"])


async def run_transcription_task(task_id: str, req: TranscribeRequest):
    """
    Background worker function for transcription.
    Uses BackgroundTaskRunner to eliminate boilerplate.
    """
    asr_service = container.get(Services.ASR)
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=asr_service.transcribe,
        worker_kwargs={
            "audio_path": req.audio_path,
            "model_name": req.model,
            "device": req.device,
            "language": req.language,
            "task_id": task_id,
            "initial_prompt": req.initial_prompt,
        },
        start_message="Starting transcription...",
        success_message="Transcribed successfully",
    )


@router.post("/", response_model=TaskResponse)
async def transcribe_audio(req: TranscribeRequest):
    """
    Start an asynchronous transcription task.
    Returns a Task ID to track progress.
    """
    logger.info(f"Received transcription request: {req.model_dump()}")
    try:
        from pathlib import Path
        from backend.utils.path_validator import validate_path
        validate_path(req.audio_path, "audio_path")
        filename = Path(req.audio_path).name or "Audio"
        response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
            task_type="transcribe",
            task_name=filename,
            request_params=req.model_dump(),
            runner_factory=lambda task_id: lambda: run_transcription_task(task_id, req),
        )
        return TaskResponse(task_id=response["task_id"], status=response["status"])

    except Exception as e:
        logger.error(f"Failed to submit task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TranscribeSegmentRequest(TranscribeRequest):
    start: float
    end: float

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

    logger.info(f"Segment Transcription Request: {duration:.2f}s ({req.start}-{req.end})")

    # HYBRID STRATEGY
    if duration > 30:
        # ASYNC PATH — offload long segments to background task
        response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
            task_type="transcribe_segment",
            task_name=f"Segment {req.start}-{req.end}",
            initial_message="Queued (Long Segment)",
            queued_message="Queued (Long Segment)",
            request_params=req.model_dump(),
            runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
                task_id=task_id,
                worker_fn=container.get(Services.ASR).transcribe_segment,
                worker_kwargs={
                    "audio_path": req.audio_path,
                    "start": req.start,
                    "end": req.end,
                    "model_name": req.model,
                    "device": req.device,
                    "language": req.language,
                    "task_id": task_id,
                },
                start_message="Processing segment...",
                success_message="Segment transcribed"
            ),
        )
        
        return TaskResponse(task_id=response["task_id"], status="pending", message="Segment too long, processing in background")

    else:
        # SYNC PATH (Non-blocking wrapper)
        try:
            import asyncio
            from functools import partial
            
            loop = asyncio.get_running_loop()
            service = container.get(Services.ASR)
            
            # Create partial function to pass arguments
            func = partial(
                service.transcribe_segment,
                req.audio_path, 
                req.start, 
                req.end, 
                req.model, 
                req.device, 
                req.language
            )
            
            # Run blocking call in default executor (thread pool)
            result = await loop.run_in_executor(None, func)
            
            if not result.success:
                raise HTTPException(status_code=500, detail=result.error)
                
            return {
                "status": "completed",
                "data": result.meta # Contains "text" and "segments"
            }
        except HTTPException:
            raise
        except Exception as e:
             logger.error(f"Sync segment transcription failed: {e}")
             raise HTTPException(status_code=500, detail=str(e))

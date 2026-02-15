from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger

from src.models.schemas import TranscribeRequest, TaskResponse
from src.core.task_runner import BackgroundTaskRunner
from src.core.container import container, Services

router = APIRouter(prefix="/transcribe", tags=["Transcription"])


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


def _get_asr_service():
    return container.get(Services.ASR)


async def run_transcription_task(task_id: str, req: TranscribeRequest):
    """
    Background worker function for transcription.
    Uses BackgroundTaskRunner to eliminate boilerplate.
    """
    asr_service = _get_asr_service()
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
async def transcribe_audio(req: TranscribeRequest, background_tasks: BackgroundTasks):
    """
    Start an asynchronous transcription task.
    Returns a Task ID to track progress.
    """
    logger.info(f"Received transcription request: {req.dict()}")
    try:
        from pathlib import Path
        filename = Path(req.audio_path).name or "Audio"

        # Create Task
        task_id = await _get_task_manager().create_task(
            task_type="transcribe",
            initial_message="Queued",
            task_name=filename,
            request_params=req.dict()
        )
        
        # Dispatch Background Task
        background_tasks.add_task(run_transcription_task, task_id, req)
        
        return TaskResponse(task_id=task_id, status="pending")

    except Exception as e:
        logger.error(f"Failed to submit task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TranscribeSegmentRequest(TranscribeRequest):
    start: float
    end: float

@router.post("/segment")
async def transcribe_segment(req: TranscribeSegmentRequest, background_tasks: BackgroundTasks):
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
        # ASYNC PATH
        try:
             # We need to extract first? No, let the task handle it.
             # Actually, our `transcribe_segment` is blocking. 
             # We should wrap it in a background task.
             # But `transcribe_segment` does extraction + transcribe.
             # Reuse existing background runner?
             # Let's just create a normal transcription task but with a "segment" flag?
             # Or simpler: Extract synchronously (fast) then Transcribe async?
             # No, extraction can be slow for remote files (not case here).
             
             # Let's perform extraction synchronously (it's stream copy usually, very fast)
             # Then submit a normal transcription task for the extracted file!
             pass 
        except Exception:
             pass
        
        # ACTUALLY, simpler approach for V1:
        # Just use the blocking `transcribe_segment` but wrap it in a thread pool if async?
        # No, for async we return TaskResponse.
        
        task_id = await _get_task_manager().create_task(
            task_type="transcribe_segment",
            initial_message="Queued (Long Segment)",
            task_name=f"Segment {req.start}-{req.end}",
            request_params=req.dict()
        )
        
        # Define worker for background
        def worker_wrapper(task_id, r):
             result = _get_asr_service().transcribe_segment(
                 r.audio_path, r.start, r.end, r.model, r.device, r.language
             )
             return result

        background_tasks.add_task(
            BackgroundTaskRunner.run,
            task_id=task_id,
            worker_fn=worker_wrapper,
            worker_kwargs={"task_id": task_id, "r": req},
            start_message="Processing segment...",
            success_message="Segment transcribed"
        )
        
        return TaskResponse(task_id=task_id, status="pending", message="Segment too long, processing in background")

    else:
        # SYNC PATH (Non-blocking wrapper)
        try:
            import asyncio
            from functools import partial
            
            loop = asyncio.get_running_loop()
            service = _get_asr_service()
            
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

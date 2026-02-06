import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from src.models.schemas import TranscribeRequest, TaskResponse
from src.services.asr import asr_service
from src.services.task_manager import task_manager
from src.core.task_runner import BackgroundTaskRunner
from loguru import logger

router = APIRouter(prefix="/transcribe", tags=["Transcription"])


async def run_transcription_task(task_id: str, req: TranscribeRequest):
    """
    Background worker function for transcription.
    Uses BackgroundTaskRunner to eliminate boilerplate.
    """
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
        # Create Task
        task_id = await task_manager.create_task(
            task_type="transcribe",
            initial_message="Queued",
            task_name=f"Transcribe {req.audio_path.split('/')[-1] or 'Audio'}",
            request_params=req.dict()
        )
        
        # Dispatch Background Task
        background_tasks.add_task(run_transcription_task, task_id, req)
        
        return TaskResponse(task_id=task_id, status="pending")

    except Exception as e:
        logger.error(f"Failed to submit task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

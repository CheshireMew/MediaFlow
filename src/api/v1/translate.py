from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from src.models.schemas import SubtitleSegment, TaskResponse
from src.services.translator.llm_translator import llm_translator
from src.services.task_manager import task_manager
from src.core.task_runner import BackgroundTaskRunner

router = APIRouter(prefix="/translate", tags=["Translator"])


class TranslateRequest(BaseModel):
    segments: List[SubtitleSegment]
    target_language: str = "Chinese"
    mode: str = "standard"  # standard, reflect


class TranslateResponse(BaseModel):
    task_id: str
    status: str
    segments: Optional[List[SubtitleSegment]] = None


async def run_translation_task(task_id: str, req: TranslateRequest):
    """
    Background translation task.
    Uses BackgroundTaskRunner to eliminate boilerplate.
    """
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=llm_translator.translate_segments,
        worker_kwargs={
            "segments": req.segments,
            "target_language": req.target_language,
            "mode": req.mode,
        },
        start_message="Starting translation...",
        success_message="Translation completed",
        result_transformer=lambda segments: {
            "segments": [seg.dict() for seg in segments]
        },
    )


@router.post("/", response_model=TranslateResponse)
async def translate_subtitles(req: TranslateRequest, background_tasks: BackgroundTasks):
    """
    Submit a translation task.
    """
    try:
        task_id = await task_manager.create_task(
            task_type="translate",
            initial_message="Queued",
            task_name=f"Translate to {req.target_language}",
            request_params={"mode": req.mode, "count": len(req.segments)}
        )
        
        background_tasks.add_task(run_translation_task, task_id, req)
        
        return TranslateResponse(task_id=task_id, status="pending")
        
    except Exception as e:
        logger.error(f"Failed to submit translation task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

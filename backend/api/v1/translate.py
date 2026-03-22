from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from backend.application.translation_service import (
    TranslationRequest as TranslateRequest,
    get_language_suffix,
    get_translation_output_suffix,
    run_translation_task,
)
from backend.models.schemas import SubtitleSegment
from backend.core.container import container, Services

router = APIRouter(prefix="/translate", tags=["Translator"])

class TranslateResponse(BaseModel):
    task_id: str
    status: str
    segments: Optional[List[SubtitleSegment]] = None


@router.post("/segment", response_model=TranslateResponse)
async def translate_segment_sync(req: TranslateRequest):
    """
    Synchronous translation for editor context menu.
    Designed for small batches (user selection).
    Uses run_in_executor to avoid blocking the event loop.
    """
    import asyncio
    from functools import partial

    translator = container.get(Services.LLM_TRANSLATOR)
    try:
        loop = asyncio.get_running_loop()
        func = partial(
            translator.translate_segments,
            req.segments,
            req.target_language,
            req.mode,
            batch_size=max(1, len(req.segments)),
        )
        translated = await loop.run_in_executor(None, func)

        return TranslateResponse(
            task_id="sync_translation",
            status="completed",
            segments=translated
        )
    except Exception as e:
        logger.error(f"Sync translation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=TranslateResponse)
async def translate_subtitles(req: TranslateRequest):
    """
    Submit a translation task.
    """
    try:
        # Extract filename from context_path if available
        from pathlib import Path
        from backend.utils.path_validator import validate_path
        source_name = "Subtitles"
        if req.context_path:
            validate_path(req.context_path, "context_path")
            source_name = Path(req.context_path).name

        response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
            task_type="translate",
            task_name=f"{source_name} ({req.target_language})",
            request_params=req.model_dump(mode="json"),
            runner_factory=lambda task_id: lambda: run_translation_task(task_id, req),
        )
        
        return TranslateResponse(task_id=response["task_id"], status=response["status"])
        
    except Exception as e:
        logger.error(f"Failed to submit translation task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

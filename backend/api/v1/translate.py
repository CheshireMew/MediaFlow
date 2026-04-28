from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from backend.application.translation_service import (
    TranslationRequest as TranslateRequest,
    execute_translation,
    submit_translation_task,
)
from backend.models.schemas import SubtitleSegment
from backend.core.runtime_access import RuntimeServices
from backend.utils.path_validator import validate_input_file

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

    try:
        if req.context_path:
            req.context_path = str(validate_input_file(req.context_path, label="context_path"))
        loop = asyncio.get_running_loop()
        func = partial(execute_translation, req, progress_callback=None)
        translated = await loop.run_in_executor(None, func)

        return TranslateResponse(
            task_id="sync_translation",
            status="completed",
            segments=translated["segments"],
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
        if req.context_path:
            req.context_path = str(validate_input_file(req.context_path, label="context_path"))

        response = await submit_translation_task(req)
        
        return TranslateResponse(task_id=response["task_id"], status=response["status"])
    except ValueError as e:
        logger.warning(f"Rejected translation request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit translation task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

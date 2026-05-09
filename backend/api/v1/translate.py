from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.models.schemas import TranslateResponse, TranslationRequest as TranslateRequest
from backend.utils.path_validator import validate_input_file

router = APIRouter(prefix="/translate", tags=["Translator"])


@router.post("/segment", response_model=TranslateResponse)
async def translate_segment_sync(req: TranslateRequest):
    """
    Synchronous translation for editor context menu.
    Designed for small batches (user selection).
    Uses run_in_executor to avoid blocking the event loop.
    """
    try:
        if req.context_ref:
            validate_input_file(req.context_ref.path, label="context_ref.path")
        from backend.application.task_operations import run_task_operation

        translated = await run_task_operation(
            "translate",
            req,
            progress_callback=None,
        )

        return TranslateResponse(
            task_id="sync_translation",
            status="completed",
            segments=translated["segments"],
            task_source="backend",
            task_contract_version=TASK_CONTRACT_VERSION,
            persistence_scope="runtime",
            lifecycle=TASK_LIFECYCLE["runtime_only"],
            queue_state="completed",
            queue_position=None,
            primary_operation="translate",
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
        if req.context_ref:
            validate_input_file(req.context_ref.path, label="context_ref.path")

        from backend.application.task_operations import submit_task_operation

        response = await submit_task_operation("translate", req)
        return TranslateResponse(**response)
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

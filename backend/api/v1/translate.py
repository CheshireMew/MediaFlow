from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.models.schemas import TranslateResponse, TranslationRequest as TranslateRequest
from backend.utils.path_validator import validate_input_file

def create_router(task_operations) -> APIRouter:
    router = APIRouter(prefix="/translate", tags=["Translator"])

    @router.post("/segment", response_model=TranslateResponse)
    async def translate_segment_sync(req: TranslateRequest):
        try:
            if req.context_ref:
                validate_input_file(req.context_ref.path, label="context_ref.path")
            translated = await task_operations.run(
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
                message_code="translation_completed",
                message_params={},
            )
        except Exception as e:
            logger.error(f"Sync translation failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/", response_model=TranslateResponse)
    async def translate_subtitles(req: TranslateRequest):
        try:
            if req.context_ref:
                validate_input_file(req.context_ref.path, label="context_ref.path")
            response = await task_operations.submit("translate", req)
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

    return router

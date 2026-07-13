from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.schemas import (
    ImmediateTranslationResponse,
    TaskResponse,
    TranslationRequest as TranslateRequest,
)
from backend.utils.path_validator import validate_input_file

def create_router(task_operations) -> APIRouter:
    router = APIRouter(prefix="/translate", tags=["Translator"])

    @router.post("/segment", response_model=ImmediateTranslationResponse)
    async def translate_segment_sync(req: TranslateRequest):
        try:
            if req.context_ref:
                validate_input_file(req.context_ref.path, label="context_ref.path")
            translated = await task_operations.run(
                "translate",
                req,
                progress_callback=None,
            )
            return ImmediateTranslationResponse.model_validate(translated)
        except Exception as e:
            logger.error(f"Sync translation failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/", response_model=TaskResponse)
    async def translate_subtitles(req: TranslateRequest):
        try:
            if req.context_ref:
                validate_input_file(req.context_ref.path, label="context_ref.path")
            response = await task_operations.submit("translate", req)
            return TaskResponse(**response)
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

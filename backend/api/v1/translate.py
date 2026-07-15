from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.translation_contracts import ImmediateTranslationResponse, TranslationRequest as TranslateRequest
from backend.utils.path_validator import validate_input_file

def create_router(translation) -> APIRouter:
    router = APIRouter(prefix="/translate", tags=["Translator"])

    @router.post("/segment", response_model=ImmediateTranslationResponse)
    async def translate_segment_sync(req: TranslateRequest):
        try:
            if req.context_ref:
                validate_input_file(req.context_ref.path, label="context_ref.path")
            translated = await translation.translate_immediate(req)
            return ImmediateTranslationResponse.model_validate(translated)
        except Exception as e:
            logger.error(f"Sync translation failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

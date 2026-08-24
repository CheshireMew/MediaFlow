from fastapi import APIRouter

from backend.models.translation_contracts import ImmediateTranslationResponse, TranslationRequest as TranslateRequest

def create_router(translation) -> APIRouter:
    router = APIRouter(prefix="/translate", tags=["Translator"])

    @router.post("/segment", response_model=ImmediateTranslationResponse)
    async def translate_segment_sync(req: TranslateRequest):
        translated = await translation.translate_immediate(req)
        return ImmediateTranslationResponse.model_validate(translated)

    return router

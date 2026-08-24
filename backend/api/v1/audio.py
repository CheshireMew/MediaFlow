
from fastapi import APIRouter

from backend.models.audio_contracts import DetectSilenceRequest, DetectSilenceResponse


def create_router(audio_application) -> APIRouter:
    router = APIRouter(tags=["Audio"])

    @router.post("/audio/detect-silence", response_model=DetectSilenceResponse)
    async def detect_silence(request: DetectSilenceRequest):
        return await audio_application.detect_silence(request)

    return router

from fastapi import APIRouter

from backend.models.transcription_contracts import TranscribeSegmentRequest, TranscribeSegmentResponse

def create_router(transcription) -> APIRouter:
    router = APIRouter(prefix="/transcribe", tags=["Transcription"])

    @router.post("/segment", response_model=TranscribeSegmentResponse)
    async def transcribe_segment(req: TranscribeSegmentRequest):
        return TranscribeSegmentResponse.model_validate(
            await transcription.transcribe_segment(req)
        )

    return router

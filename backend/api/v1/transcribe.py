from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.transcription_contracts import TranscribeSegmentRequest, TranscribeSegmentResponse
from backend.utils.path_validator import validate_input_file

def create_router(transcription) -> APIRouter:
    router = APIRouter(prefix="/transcribe", tags=["Transcription"])

    @router.post("/segment", response_model=TranscribeSegmentResponse)
    async def transcribe_segment(req: TranscribeSegmentRequest):
        duration = req.end - req.start
        if duration <= 0:
            raise HTTPException(status_code=400, detail="Invalid duration")
        try:
            validate_input_file(req.audio_ref.path, label="audio_ref.path")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        logger.info(
            f"Segment Transcription Request: {duration:.2f}s ({req.start}-{req.end})"
        )
        try:
            return TranscribeSegmentResponse.model_validate(
                await transcription.transcribe_segment(req)
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Sync segment transcription failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

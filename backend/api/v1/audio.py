
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Tuple
from loguru import logger
from backend.models.schemas import MediaReference
from backend.utils.path_validator import validate_input_file

router = APIRouter(tags=["Audio"])

class DetectSilenceRequest(BaseModel):
    audio_ref: MediaReference
    threshold: str = "-30dB"
    min_duration: float = 0.5

class DetectSilenceResponse(BaseModel):
    silence_intervals: List[Tuple[float, float]]

@router.post("/audio/detect-silence", response_model=DetectSilenceResponse)
async def detect_silence(req: DetectSilenceRequest):
    """
    Detect silence intervals in an audio file.
    """
    try:
        audio_path = str(validate_input_file(req.audio_ref.path, label="audio_ref.path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from backend.utils.audio_processor import AudioProcessor

        intervals = AudioProcessor.detect_silence(
            audio_path,
            silence_thresh=req.threshold, 
            min_silence_dur=req.min_duration
        )
        return DetectSilenceResponse(silence_intervals=intervals)
    except Exception as e:
        logger.error(f"Silence detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Tuple
from loguru import logger
from backend.utils.audio_processor import AudioProcessor
import os

router = APIRouter(tags=["Audio"])

class DetectSilenceRequest(BaseModel):
    file_path: str
    threshold: str = "-30dB"
    min_duration: float = 0.5

class DetectSilenceResponse(BaseModel):
    silence_intervals: List[Tuple[float, float]]

@router.post("/audio/detect-silence", response_model=DetectSilenceResponse)
async def detect_silence(req: DetectSilenceRequest):
    """
    Detect silence intervals in an audio file.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    try:
        intervals = AudioProcessor.detect_silence(
            req.file_path, 
            silence_thresh=req.threshold, 
            min_silence_dur=req.min_duration
        )
        return DetectSilenceResponse(silence_intervals=intervals)
    except Exception as e:
        logger.error(f"Silence detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

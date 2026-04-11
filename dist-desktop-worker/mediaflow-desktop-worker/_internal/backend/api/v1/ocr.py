from fastapi import APIRouter, HTTPException
import os
from backend.application.ocr_service import load_ocr_results, submit_ocr_task
from backend.models.schemas import OCRExtractRequest, OCRExtractResponse

router = APIRouter()

@router.post("/extract", response_model=OCRExtractResponse)
async def extract_text(request: OCRExtractRequest):
    from backend.utils.path_validator import validate_path
    if not request.video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    validate_path(request.video_path, "video_path")

    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    response = await submit_ocr_task(request)
    return OCRExtractResponse(task_id=response["task_id"])


@router.get("/results")
async def get_ocr_results(video_path: str):
    """Load previously saved OCR results for a video, if any."""
    return load_ocr_results(video_path)


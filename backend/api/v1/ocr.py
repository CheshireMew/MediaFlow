from fastapi import APIRouter, HTTPException
from backend.application.ocr_service import load_ocr_results, submit_ocr_task
from backend.models.schemas import OCRExtractRequest, OCRExtractResponse
from backend.utils.path_validator import validate_input_file

router = APIRouter()

@router.post("/extract", response_model=OCRExtractResponse)
async def extract_text(request: OCRExtractRequest):
    if not request.video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    try:
        request.video_path = str(validate_input_file(request.video_path, label="video_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    response = await submit_ocr_task(request)
    return OCRExtractResponse(task_id=response["task_id"])


@router.get("/results")
async def get_ocr_results(video_path: str):
    """Load previously saved OCR results for a video, if any."""
    try:
        resolved_video_path = str(validate_input_file(video_path, label="video_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return load_ocr_results(resolved_video_path)

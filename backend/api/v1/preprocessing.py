from fastapi import APIRouter, HTTPException
import logging
from backend.application.preprocessing_service import (
    submit_cleanup_task,
    submit_enhancement_task,
)
from backend.models.schemas import (
    CleanRequest,
    EnhanceRequest,
    PreprocessingResponse,
)
from backend.utils.path_validator import validate_input_file

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/enhance", response_model=PreprocessingResponse)
async def enhance_video(request: EnhanceRequest):
    """
    Video Enhancement (Super Resolution) using Real-ESRGAN or BasicVSR++.
    """
    if not request.video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    try:
        request.video_path = str(validate_input_file(request.video_path, label="video_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from backend.core.runtime_access import RuntimeServices
    enhancer = RuntimeServices.enhancer()
    # 1. Check availability
    if not enhancer.is_available(request.method):
        detail = "Real-ESRGAN binary not found." if request.method == "realesrgan" else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        raise HTTPException(status_code=503, detail=detail)

    response = await submit_enhancement_task(request)

    return PreprocessingResponse(
        task_id=response["task_id"],
        status="queued",
        message=f"Enhancement started (Task {response['task_id']})"
    )

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_video(
    request: CleanRequest,
):
    """
    Video Cleanup (Watermark Removal) using OpenCV or ProPainter.
    """
    if not request.video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    try:
        request.video_path = str(validate_input_file(request.video_path, label="video_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    response = await submit_cleanup_task(request)

    return PreprocessingResponse(
        task_id=response["task_id"],
        status="queued",
        message=f"Cleanup started (Task {response['task_id']})"
    )

from fastapi import APIRouter, HTTPException
import logging
from backend.core.container import Services
from backend.core.runtime_access import runtime_service
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
    try:
        validate_input_file(request.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    enhancer = runtime_service(Services.ENHANCER)
    # 1. Check availability
    if not enhancer.is_available(request.method):
        detail = "Real-ESRGAN binary not found." if request.method == "realesrgan" else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        raise HTTPException(status_code=503, detail=detail)

    from backend.application.task_operations import submit_task_operation

    response = await submit_task_operation("enhancement", request)

    return PreprocessingResponse.model_validate(
        {**response, "message": f"Enhancement started (Task {response['task_id']})"}
    )

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_video(
    request: CleanRequest,
):
    """
    Video Cleanup (Watermark Removal) using OpenCV or ProPainter.
    """
    try:
        validate_input_file(request.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from backend.application.task_operations import submit_task_operation

    response = await submit_task_operation("cleanup", request)

    return PreprocessingResponse.model_validate(
        {**response, "message": f"Cleanup started (Task {response['task_id']})"}
    )

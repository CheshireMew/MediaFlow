from fastapi import APIRouter, HTTPException
import logging
from backend.models.schemas import (
    CleanRequest,
    EnhanceRequest,
    PreprocessingResponse,
)
from backend.utils.path_validator import validate_input_file

logger = logging.getLogger(__name__)

def create_router(*, task_operations, enhancer) -> APIRouter:
    router = APIRouter()

    @router.post("/enhance", response_model=PreprocessingResponse)
    async def enhance_video(request: EnhanceRequest):
        try:
            validate_input_file(request.video_ref.path, label="video_ref.path")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        if enhancer is None or not enhancer.is_available(request.method):
            detail = (
                "Real-ESRGAN binary not found."
                if request.method == "realesrgan"
                else "BasicVSR++ dependencies (mmmagic, cuda) not found."
            )
            raise HTTPException(status_code=503, detail=detail)
        response = await task_operations.submit("enhancement", request)
        return PreprocessingResponse.model_validate(response)

    @router.post("/clean", response_model=PreprocessingResponse)
    async def clean_video(request: CleanRequest):
        try:
            validate_input_file(request.video_ref.path, label="video_ref.path")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        response = await task_operations.submit("cleanup", request)
        return PreprocessingResponse.model_validate(response)

    return router

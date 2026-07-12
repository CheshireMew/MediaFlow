from fastapi import APIRouter, HTTPException
from backend.models.schemas import MediaReference, OCRExtractRequest, OCRExtractResponse
from backend.utils.path_validator import validate_input_file

def create_router(task_operations) -> APIRouter:
    router = APIRouter()

    @router.post("/extract", response_model=OCRExtractResponse)
    async def extract_text(request: OCRExtractRequest):
        try:
            validate_input_file(request.video_ref.path, label="video_ref.path")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        response = await task_operations.submit("extract", request)
        return OCRExtractResponse(**response)

    @router.post("/results")
    async def get_ocr_results(video_ref: MediaReference):
        try:
            resolved_video_path = str(
                validate_input_file(video_ref.path, label="video_ref.path")
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        from backend.application.ocr_service import load_ocr_results

        return load_ocr_results(resolved_video_path)

    return router

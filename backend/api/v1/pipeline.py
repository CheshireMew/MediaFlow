from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.schemas import PipelineRequest


def create_router(download_application) -> APIRouter:
    router = APIRouter(prefix="/pipeline", tags=["Pipeline"])

    @router.post("/run")
    async def run_pipeline(req: PipelineRequest):
        try:
            return await download_application.submit_pipeline(req)
        except Exception as e:
            logger.error(f"Pipeline submission failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

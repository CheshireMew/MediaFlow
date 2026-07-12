"""
URL Analysis API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from backend.models.schemas import AnalyzeResult
from loguru import logger


class AnalyzeRequest(BaseModel):
    url: HttpUrl


def create_router(download_application) -> APIRouter:
    router = APIRouter(prefix="/analyze", tags=["Analyze"])

    @router.post("/", response_model=AnalyzeResult)
    async def analyze_url(req: AnalyzeRequest):
        """Analyze a URL without downloading it."""
        try:
            return await download_application.analyze_url(str(req.url))
        except ValueError as e:
            logger.error(f"Analysis failed: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

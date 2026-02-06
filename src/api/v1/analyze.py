"""
URL Analysis API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from src.core.container import container, Services

def _get_analyzer_service():
    return container.get(Services.ANALYZER)
from src.models.schemas import AnalyzeResult
from loguru import logger


router = APIRouter(prefix="/analyze", tags=["Analyze"])


class AnalyzeRequest(BaseModel):
    url: HttpUrl


@router.post("/", response_model=AnalyzeResult)
async def analyze_url(req: AnalyzeRequest):
    """
    Analyze a URL to detect if it's a single video or playlist.
    Returns metadata about the content without downloading.
    """
    try:
        result = await _get_analyzer_service().analyze(str(req.url))
        return result
    except ValueError as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

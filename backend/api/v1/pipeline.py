from fastapi import APIRouter, HTTPException
from loguru import logger

from backend.models.pipeline_contracts import PipelineRequest
from backend.models.task_contracts import TaskResponse


def create_router(task_orchestrator) -> APIRouter:
    router = APIRouter(prefix="/pipeline", tags=["Pipeline"])

    @router.post("/run", response_model=TaskResponse)
    async def run_pipeline(req: PipelineRequest):
        try:
            return await task_orchestrator.submit_pipeline(req)
        except Exception as e:
            logger.error(f"Pipeline submission failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

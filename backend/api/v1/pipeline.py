from fastapi import APIRouter

from backend.models.pipeline_contracts import PipelineRequest
from backend.models.task_contracts import TaskResponse


def create_router(task_orchestrator) -> APIRouter:
    router = APIRouter(prefix="/pipeline", tags=["Pipeline"])

    @router.post("/run", response_model=TaskResponse)
    async def run_pipeline(req: PipelineRequest):
        return await task_orchestrator.submit_pipeline(req)

    return router

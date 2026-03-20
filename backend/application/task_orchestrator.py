from loguru import logger

from backend.models.schemas import PipelineRequest
from backend.services.settings_manager import UserSettings
from backend.application.pipeline_submission_service import PipelineSubmissionService
from backend.application.task_request_deduplicator import TaskRequestDeduplicator
from backend.application.task_resume_service import TaskResumeService


class TaskOrchestrator:
    def __init__(
        self,
        task_manager,
        pipeline_runner,
        settings_manager,
        download_workflow_service=None,
        transcriber_workflow_service=None,
        task_request_deduplicator=None,
        task_resume_service=None,
        pipeline_submission_service=None,
    ):
        self._task_manager = task_manager
        self._pipeline_runner = pipeline_runner
        self._settings_manager = settings_manager
        self._download_workflow_service = download_workflow_service
        self._transcriber_workflow_service = transcriber_workflow_service
        self._task_request_deduplicator = (
            task_request_deduplicator or TaskRequestDeduplicator()
        )
        self._task_resume_service = task_resume_service or TaskResumeService()
        self._pipeline_submission_service = (
            pipeline_submission_service or PipelineSubmissionService()
        )

    def prepare_pipeline_request(self, req: PipelineRequest) -> PipelineRequest:
        if req.pipeline_id not in {"downloader_tool", "transcriber_tool"} or not req.steps:
            return req

        settings: UserSettings = self._settings_manager.get_settings()
        if (
            req.pipeline_id == "downloader_tool"
            and self._download_workflow_service is not None
        ):
            return self._download_workflow_service.prepare_request(req, settings)
        if (
            req.pipeline_id == "transcriber_tool"
            and self._transcriber_workflow_service is not None
        ):
            return self._transcriber_workflow_service.prepare_request(req, settings)

        return req

    def find_existing_task(self, task_type: str, request_params: dict) -> str | None:
        return self._task_request_deduplicator.find_existing_task(
            self._task_manager.tasks.values(),
            task_type,
            request_params,
        )

    async def reset_task_for_reuse(self, task_id: str, message: str = "Resuming...") -> None:
        await self._task_resume_service.reset_task_for_reuse(
            self._task_manager,
            task_id,
            message=message,
        )

    def build_resume_runner(self, task) -> callable:
        return self._task_resume_service.build_resume_runner(task)

    async def submit_pipeline(self, req: PipelineRequest) -> dict:
        req = self.prepare_pipeline_request(req)
        task_type = "pipeline"
        if self._download_workflow_service is not None:
            task_type = self._download_workflow_service.infer_task_type(req)
        return await self._pipeline_submission_service.submit_pipeline(
            orchestrator=self,
            req=req,
            task_type=task_type,
        )

    async def submit_task(
        self,
        *,
        task_type: str,
        task_name: str,
        request_params: dict,
        runner_factory,
        initial_message: str = "Queued",
        queued_message: str = "Queued",
    ) -> dict:
        task_id = await self._task_manager.create_task(
            task_type=task_type,
            initial_message=initial_message,
            task_name=task_name,
            request_params=request_params,
        )
        await self._task_manager.enqueue_task(
            task_id,
            runner_factory(task_id),
            queued_message=queued_message,
        )
        return {"task_id": task_id, "status": "pending", "message": queued_message}

    async def resume_task(self, task_id: str) -> dict:
        task = self._task_manager.get_task(task_id)
        if not task:
            raise ValueError("Task not found")
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")
        if task.status == "running":
            return {"message": "Task is already running", "status": "running"}

        await self.reset_task_for_reuse(task_id)
        await self._task_manager.enqueue_task(
            task_id,
            self.build_resume_runner(task),
            queued_message="Queued",
        )
        return {"message": "Task resumed", "status": "pending"}

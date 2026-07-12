from typing import TYPE_CHECKING

from backend.models.schemas import PipelineRequest
from backend.models.task_message import TaskMessageParams
from backend.services.settings_manager import UserSettings

if TYPE_CHECKING:
    from backend.services.task_manager import TaskManager


class TaskOrchestrator:
    def __init__(
        self,
        task_manager: "TaskManager",
        settings_manager,
        *,
        download_workflow_service,
        transcriber_workflow_service,
        task_request_deduplicator,
        task_resume_service,
        pipeline_submission_service,
        task_runner_registry,
    ):
        self._task_manager = task_manager
        self._settings_manager = settings_manager
        self._download_workflow_service = download_workflow_service
        self._transcriber_workflow_service = transcriber_workflow_service
        self._task_request_deduplicator = task_request_deduplicator
        self._task_resume_service = task_resume_service
        self._pipeline_submission_service = pipeline_submission_service
        self._task_runner_registry = task_runner_registry

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

    def get_task(self, task_id: str):
        return self._task_manager.get_task(task_id)

    def serialize_task(self, task):
        if task is None:
            raise ValueError("Task not found")
        return self._task_manager.serialize_task(task)

    async def wait_until_task_state_ready(self) -> None:
        await self._task_manager.wait_until_tasks_loaded()

    async def enqueue_existing_task(
        self,
        task_id: str,
        queued_message_code: str = "queued",
        queued_message_params: TaskMessageParams | None = None,
    ) -> None:
        task = self.get_task(task_id)
        if not task:
            raise ValueError("Task not found")
        await self._task_manager.enqueue_task(
            task_id,
            self.build_resume_runner(task),
            queued_message_code=queued_message_code,
            queued_message_params=queued_message_params,
        )

    async def reset_task_for_reuse(
        self,
        task_id: str,
        message_code: str = "resumed",
        message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
    ) -> None:
        await self._task_resume_service.reset_task_for_reuse(
            self._task_manager,
            task_id,
            message_code=message_code,
            message_params=message_params,
            request_params=request_params,
        )

    def build_resume_runner(self, task) -> callable:
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")
        return self._task_runner_registry.build(task)

    async def submit_pipeline(self, req: PipelineRequest) -> dict:
        await self.wait_until_task_state_ready()
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
        initial_message_code: str = "queued",
        initial_message_params: TaskMessageParams | None = None,
        queued_message_code: str = "queued",
        queued_message_params: TaskMessageParams | None = None,
    ) -> dict:
        await self.wait_until_task_state_ready()
        task_id = await self._task_manager.create_task(
            task_type=task_type,
            initial_message_code=initial_message_code,
            initial_message_params=initial_message_params,
            task_name=task_name,
            request_params=request_params,
        )
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found after creation: {task_id}")
        await self._task_manager.enqueue_task(
            task_id,
            self._task_runner_registry.build(task),
            queued_message_code=queued_message_code,
            queued_message_params=queued_message_params,
        )
        from backend.application.pipeline_submission_service import task_submission_response

        return task_submission_response(
            self.serialize_task(self.get_task(task_id)),
            queued_message_code,
            queued_message_params,
        )

    async def resume_task(self, task_id: str) -> dict:
        await self.wait_until_task_state_ready()
        task = self.get_task(task_id)
        if not task:
            raise ValueError("Task not found")
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")
        if task.status == "running":
            return {
                "message_code": "already_running",
                "message_params": {},
                "status": "running",
            }

        await self.reset_task_for_reuse(task_id)
        await self.enqueue_existing_task(task_id, queued_message_code="queued")
        return {"message_code": "resumed", "message_params": {}, "status": "pending"}

import asyncio
from typing import TYPE_CHECKING

from backend.models.pipeline_contracts import PipelineRequest
from backend.models.task_message import TaskMessageParams
from backend.application.task_submission_response import task_submission_response

if TYPE_CHECKING:
    from backend.services.task_manager import TaskManager


class TaskOrchestrator:
    def __init__(
        self,
        task_manager: "TaskManager",
        settings_manager,
        *,
        pipeline_request_preparer,
        pipeline_runner,
        task_request_deduplicator,
        task_resume_service,
    ):
        self._task_manager = task_manager
        self._settings_manager = settings_manager
        self._pipeline_request_preparer = pipeline_request_preparer
        self._pipeline_runner = pipeline_runner
        self._task_request_deduplicator = task_request_deduplicator
        self._task_resume_service = task_resume_service
        self._submission_lock = asyncio.Lock()

    def prepare_pipeline_request(self, req: PipelineRequest) -> PipelineRequest:
        return self._pipeline_request_preparer.prepare(
            req,
            self._settings_manager.get_settings(),
        )

    def find_existing_task(self, task_type: str, request_params: dict) -> str | None:
        return self._task_request_deduplicator.find_existing_task(
            self._task_manager.tasks.values(),
            task_type,
            request_params,
        )

    def get_task(self, task_id: str):
        return self._task_manager.get_task(task_id)

    async def get_task_record(self, task_id: str):
        return await self._task_manager.get_task_record(task_id)

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

    async def reset_paused_task(
        self,
        task_id: str,
        message_code: str = "resumed",
        message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
    ) -> None:
        await self._task_resume_service.reset_paused_task(
            self._task_manager,
            task_id,
            message_code=message_code,
            message_params=message_params,
            request_params=request_params,
        )

    def build_resume_runner(self, task) -> callable:
        if not task.request_params:
            raise ValueError("Cannot resume task: Missing parameters")
        request = PipelineRequest.model_validate(task.request_params)
        return lambda: self._pipeline_runner.run(request.steps, task.id)

    async def submit_pipeline(self, req: PipelineRequest) -> dict:
        await self.wait_until_task_state_ready()
        req = self.prepare_pipeline_request(req)
        async with self._submission_lock:
            request_params = req.model_dump(mode="json")
            existing_task_id = self.find_existing_task("pipeline", request_params)
            if existing_task_id:
                existing_task = self.get_task(existing_task_id)
                if existing_task:
                    return task_submission_response(
                        self.serialize_task(existing_task),
                        "already_active",
                        {},
                    )
            task_id = await self._task_manager.create_task(
                task_type="pipeline",
                initial_message_code="queued",
                initial_message_params={},
                task_name=req.task_name,
                request_params=request_params,
            )
            task = self.get_task(task_id)
            if not task:
                raise ValueError(f"Task not found after creation: {task_id}")
            await self._task_manager.enqueue_task(
                task_id,
                self.build_resume_runner(task),
                queued_message_code="queued",
                queued_message_params={},
            )
            return task_submission_response(
                self.serialize_task(self.get_task(task_id)),
                "queued",
                {},
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
        if task.status != "paused":
            raise ValueError("Only paused tasks can be resumed")

        await self.reset_paused_task(task_id)
        await self.enqueue_existing_task(task_id, queued_message_code="queued")
        return {"message_code": "resumed", "message_params": {}, "status": "pending"}

    async def retry_task(self, task_id: str) -> dict:
        await self.wait_until_task_state_ready()
        task = await self.get_task_record(task_id)
        if not task:
            raise ValueError("Task not found")
        if task.status != "failed":
            raise ValueError("Only failed tasks can be retried")
        if not task.request_params:
            raise ValueError("Cannot retry task: Missing parameters")
        return await self.submit_pipeline(
            PipelineRequest.model_validate(task.request_params)
        )

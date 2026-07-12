from types import SimpleNamespace

import pytest

from backend.application.pipeline_submission_service import (
    PipelineSubmissionService,
    task_submission_response,
)
from backend.application.task_orchestrator import TaskOrchestrator
from backend.application.task_request_deduplicator import TaskRequestDeduplicator
from backend.application.task_resume_service import TaskResumeService
from backend.core.tasks.registry import TaskRunnerRegistry
from backend.models.schemas import PipelineRequest
from backend.contracts import TASK_CONTRACT_VERSION


class DummySettingsManager:
    def get_settings(self):
        return SimpleNamespace(
            default_download_path=None,
            auto_execute_flow=False,
        )


class FakeTaskManager:
    def __init__(self, tasks=None):
        self.tasks = tasks or {}
        self.updated = []
        self.enqueued = []

    def get_task(self, task_id):
        return self.tasks.get(task_id)

    async def wait_until_tasks_loaded(self):
        return None

    async def update_task(self, task_id, **kwargs):
        self.updated.append((task_id, kwargs))
        task = self.tasks[task_id]
        for key, value in kwargs.items():
            setattr(task, key, value)

    async def enqueue_task(
        self,
        task_id,
        runner,
        queued_message_code=None,
        queued_message_params=None,
    ):
        self.enqueued.append(
            (task_id, runner, queued_message_code, queued_message_params or {})
        )
        self.tasks[task_id].status = "pending"
        self.tasks[task_id].message_code = queued_message_code or "queued"
        self.tasks[task_id].message_params = queued_message_params or {}

    def serialize_task(self, task):
        return SimpleNamespace(
            id=task.id,
            status=task.status,
            message_code=task.message_code,
            message_params=task.message_params,
            task_source="backend",
            task_contract_version=TASK_CONTRACT_VERSION,
            persistence_scope="runtime",
            lifecycle="resumable",
            queue_state="queued" if task.status == "pending" else task.status,
            queue_position=None,
            primary_operation=task.type,
        )


def create_orchestrator(task_manager, task_runner_registry=None):
    registry = task_runner_registry
    if registry is None:
        registry = TaskRunnerRegistry()
        registry.register("pipeline", lambda _task: object())
    return TaskOrchestrator(
        task_manager=task_manager,
        settings_manager=DummySettingsManager(),
        download_workflow_service=None,
        transcriber_workflow_service=None,
        task_request_deduplicator=TaskRequestDeduplicator(),
        task_resume_service=TaskResumeService(),
        pipeline_submission_service=PipelineSubmissionService(),
        task_runner_registry=registry,
    )


def test_deduplication_key_keeps_all_download_result_inputs():
    first = {
        "url": "https://example.com/video",
        "format": "best",
        "proxy": None,
        "cookie_file": "D:/cookies-a.txt",
        "output_filename": "first.mp4",
    }
    second = {
        "url": "https://example.com/video",
        "format": "best",
        "proxy": "http://127.0.0.1:7890",
        "cookie_file": "D:/cookies-b.txt",
        "output_filename": "second.mp4",
    }

    assert TaskRequestDeduplicator.get_comparison_key(first) != TaskRequestDeduplicator.get_comparison_key(second)


@pytest.mark.asyncio
async def test_submit_pipeline_recycles_matching_completed_task():
    task = SimpleNamespace(
        id="task-1",
        type="pipeline",
        status="completed",
        message_code="completed",
        message_params={},
        request_params={
            "pipeline_id": "downloader_tool",
            "steps": [{"step_name": "download", "params": {"url": "https://example.com/video"}}],
        },
    )
    task_manager = FakeTaskManager(tasks={"task-1": task})
    orchestrator = create_orchestrator(task_manager)

    req = PipelineRequest.model_validate(
        {
            "pipeline_id": "downloader_tool",
            "steps": [{"step_name": "download", "params": {"url": "https://example.com/video"}}],
        }
    )
    task.request_params = req.model_dump(mode="json")

    result = await orchestrator.submit_pipeline(req)

    assert result == task_submission_response(
        task_manager.serialize_task(task),
        "restarted",
        {},
    )
    assert task_manager.updated
    updated_task_id, updates = task_manager.updated[0]
    assert updated_task_id == "task-1"
    assert updates["status"] == "pending"
    assert updates["progress"] == 0.0
    assert updates["message_code"] == "resumed"
    assert updates["message_params"] == {}
    assert updates["request_params"] == req.model_dump(mode="json")
    assert task_manager.enqueued[0][0] == "task-1"
    assert task_manager.enqueued[0][2:] == ("queued", {})


@pytest.mark.asyncio
async def test_resume_task_enqueues_runner_from_registered_definition():
    task = SimpleNamespace(
        id="task-2",
        type="transcribe",
        status="paused",
        message_code="paused",
        message_params={},
        request_params={"foo": "bar"},
    )
    task_manager = FakeTaskManager(tasks={"task-2": task})
    runner = object()

    def build_runner(incoming_task):
        assert incoming_task is task
        return runner

    registry = TaskRunnerRegistry()
    registry.register("transcribe", build_runner)
    orchestrator = create_orchestrator(task_manager, registry)

    result = await orchestrator.resume_task("task-2")

    assert result == {
        "message_code": "resumed",
        "message_params": {},
        "status": "pending",
    }
    assert task_manager.updated[0][0] == "task-2"
    assert task_manager.updated[0][1]["status"] == "pending"
    assert task_manager.enqueued == [("task-2", runner, "queued", {})]

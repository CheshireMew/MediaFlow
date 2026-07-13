import asyncio
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
        self.created = 0

    async def create_task(
        self,
        *,
        task_type,
        task_name,
        request_params,
        initial_message_code,
        initial_message_params,
    ):
        self.created += 1
        task_id = "task-new" if self.created == 1 else f"task-new-{self.created}"
        self.tasks[task_id] = SimpleNamespace(
            id=task_id,
            type=task_type,
            name=task_name,
            status="pending",
            revision=0,
            message_code=initial_message_code,
            message_params=initial_message_params or {},
            request_params=request_params,
        )
        return task_id

    def get_task(self, task_id):
        return self.tasks.get(task_id)

    async def get_task_record(self, task_id):
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
            revision=task.revision,
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
async def test_submit_pipeline_creates_a_new_attempt_for_matching_completed_task():
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
        revision=7,
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

    new_task = task_manager.tasks["task-new"]
    assert result == task_submission_response(
        task_manager.serialize_task(new_task),
        "queued",
        {},
    )
    assert task_manager.updated == []
    assert task.status == "completed"
    assert task.revision == 7
    assert task_manager.enqueued[0][0] == "task-new"
    assert task_manager.enqueued[0][2:] == ("queued", {})


@pytest.mark.asyncio
async def test_concurrent_matching_pipeline_submissions_create_one_active_task():
    task_manager = FakeTaskManager()
    orchestrator = create_orchestrator(task_manager)
    req = PipelineRequest.model_validate(
        {
            "pipeline_id": "downloader_tool",
            "steps": [
                {
                    "step_name": "download",
                    "params": {"url": "https://example.com/video"},
                }
            ],
        }
    )

    first, second = await asyncio.gather(
        orchestrator.submit_pipeline(req),
        orchestrator.submit_pipeline(req),
    )

    assert task_manager.created == 1
    assert first["task_id"] == "task-new"
    assert second["task_id"] == "task-new"
    assert second["message_code"] == "already_active"


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


@pytest.mark.asyncio
async def test_retry_failed_task_creates_a_new_attempt_and_preserves_history():
    failed_task = SimpleNamespace(
        id="failed-task",
        type="transcribe",
        name="Failed transcription",
        status="failed",
        revision=4,
        message_code="failed",
        message_params={},
        request_params={"audio_ref": {"path": "D:/media/audio.wav"}},
    )
    task_manager = FakeTaskManager(tasks={failed_task.id: failed_task})
    registry = TaskRunnerRegistry()
    registry.register("transcribe", lambda _task: object())
    orchestrator = create_orchestrator(task_manager, registry)

    result = await orchestrator.retry_task(failed_task.id)

    assert result["task_id"] == "task-new"
    assert task_manager.tasks[failed_task.id].status == "failed"
    assert task_manager.tasks[failed_task.id].revision == 4
    assert task_manager.tasks["task-new"].request_params == failed_task.request_params

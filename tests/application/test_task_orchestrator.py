from types import SimpleNamespace

import pytest

from backend.application.pipeline_submission_service import PipelineSubmissionService
from backend.application.task_orchestrator import TaskOrchestrator
from backend.application.task_request_deduplicator import TaskRequestDeduplicator
from backend.application.task_resume_service import TaskResumeService
from backend.core.tasks import registry as task_registry
from backend.models.schemas import PipelineRequest


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

    async def update_task(self, task_id, **kwargs):
        self.updated.append((task_id, kwargs))
        task = self.tasks[task_id]
        for key, value in kwargs.items():
            setattr(task, key, value)

    async def enqueue_task(self, task_id, runner, queued_message=None):
        self.enqueued.append((task_id, runner, queued_message))


def create_orchestrator(task_manager):
    return TaskOrchestrator(
        task_manager=task_manager,
        settings_manager=DummySettingsManager(),
        download_workflow_service=None,
        transcriber_workflow_service=None,
        task_request_deduplicator=TaskRequestDeduplicator(),
        task_resume_service=TaskResumeService(),
        pipeline_submission_service=PipelineSubmissionService(),
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

    assert result == {
        "task_id": "task-1",
        "status": "pending",
        "message": "Task restarted (Recycled)",
    }
    assert task_manager.updated
    updated_task_id, updates = task_manager.updated[0]
    assert updated_task_id == "task-1"
    assert updates["status"] == "pending"
    assert updates["progress"] == 0.0
    assert updates["message"] == "Resuming..."
    assert task_manager.enqueued[0][0] == "task-1"
    assert task_manager.enqueued[0][2] == "Queued"


@pytest.mark.asyncio
async def test_resume_task_enqueues_runner_from_registered_definition():
    original_factories = dict(task_registry._TASK_RUNNER_FACTORIES)
    original_loaded = task_registry._definitions_loaded
    task_registry.clear_task_runners()

    task = SimpleNamespace(
        id="task-2",
        type="transcribe",
        status="paused",
        request_params={"foo": "bar"},
    )
    task_manager = FakeTaskManager(tasks={"task-2": task})
    orchestrator = create_orchestrator(task_manager)

    runner = object()

    def build_runner(incoming_task):
        assert incoming_task is task
        return runner

    task_registry.register_task_runner("transcribe", build_runner)

    try:
        result = await orchestrator.resume_task("task-2")
    finally:
        task_registry._TASK_RUNNER_FACTORIES.clear()
        task_registry._TASK_RUNNER_FACTORIES.update(original_factories)
        task_registry._definitions_loaded = original_loaded

    assert result == {"message": "Task resumed", "status": "pending"}
    assert task_manager.updated[0][0] == "task-2"
    assert task_manager.updated[0][1]["status"] == "pending"
    assert task_manager.enqueued == [("task-2", runner, "Queued")]

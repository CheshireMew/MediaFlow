from types import SimpleNamespace

import pytest

from backend.application.pipeline_submission_service import PipelineSubmissionService
from backend.application.task_orchestrator import TaskOrchestrator
from backend.application.task_request_deduplicator import TaskRequestDeduplicator
from backend.application.task_resume_service import TaskResumeService
from backend.core.tasks.registry import TaskHandlerRegistry
from backend.models.schemas import PipelineRequest


class DummySettingsManager:
    def get_settings(self):
        return SimpleNamespace(
            default_download_path=None,
            auto_execute_flow=False,
            transcription_model="base",
            translation_target_language="Chinese",
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
        pipeline_runner=SimpleNamespace(run=lambda *args, **kwargs: None),
        settings_manager=DummySettingsManager(),
        download_workflow_service=None,
        transcriber_workflow_service=None,
        task_request_deduplicator=TaskRequestDeduplicator(),
        task_resume_service=TaskResumeService(),
        pipeline_submission_service=PipelineSubmissionService(),
    )


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
async def test_resume_task_enqueues_runner_from_registered_handler():
    original_handlers = dict(TaskHandlerRegistry._handlers)
    TaskHandlerRegistry.clear()

    task = SimpleNamespace(
        id="task-2",
        type="resume_test",
        status="paused",
        request_params={"foo": "bar"},
    )
    task_manager = FakeTaskManager(tasks={"task-2": task})
    orchestrator = create_orchestrator(task_manager)

    runner = object()

    @TaskHandlerRegistry.register("resume_test")
    class ResumeTestHandler:
        def build_runner(self, incoming_task):
            assert incoming_task is task
            return runner

    try:
        result = await orchestrator.resume_task("task-2")
    finally:
        TaskHandlerRegistry._handlers = original_handlers

    assert result == {"message": "Task resumed", "status": "pending"}
    assert task_manager.updated[0][0] == "task-2"
    assert task_manager.updated[0][1]["status"] == "pending"
    assert task_manager.enqueued == [("task-2", runner, "Queued")]

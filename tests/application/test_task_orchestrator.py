import asyncio
from types import SimpleNamespace

import pytest

from backend.application.pipeline_request_preparer import PipelineRequestPreparer
from backend.application.task_orchestrator import TaskOrchestrator
from backend.application.task_request_deduplicator import TaskRequestDeduplicator
from backend.application.task_resume_service import TaskResumeService
from backend.application.task_submission_response import task_submission_response
from backend.contracts import TASK_CONTRACT_VERSION
from backend.models.pipeline_contracts import PipelineRequest


class DummySettingsManager:
    def get_settings(self):
        return SimpleNamespace(default_download_path=None, auto_execute_flow=False)


class FakePipelineRunner:
    def __init__(self):
        self.calls = []

    async def run(self, steps, task_id, checkpoint=None):
        self.calls.append((steps, task_id, checkpoint))


class FakeTaskManager:
    def __init__(self, tasks=None):
        self.tasks = tasks or {}
        self.updated = []
        self.enqueued = []
        self.created = 0

    async def create_task(self, *, task_type, task_name, request_params, initial_message_code, initial_message_params):
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
        for key, value in kwargs.items():
            setattr(self.tasks[task_id], key, value)

    async def enqueue_task(self, task_id, runner, queued_message_code=None, queued_message_params=None):
        self.enqueued.append((task_id, runner, queued_message_code, queued_message_params or {}))
        self.tasks[task_id].status = "pending"
        self.tasks[task_id].message_code = queued_message_code or "queued"
        self.tasks[task_id].message_params = queued_message_params or {}

    def serialize_task(self, task):
        first_step = (task.request_params or {}).get("steps", [{}])[0]
        operation = first_step.get("step_name", "pipeline")
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
            primary_operation=operation,
            revision=task.revision,
        )


def pipeline_request() -> PipelineRequest:
    return PipelineRequest.model_validate(
        {
            "pipeline_id": "downloader_tool",
            "steps": [
                {"step_name": "download", "params": {"url": "https://example.com/video"}}
            ],
        }
    )


def create_orchestrator(task_manager):
    runner = FakePipelineRunner()
    return TaskOrchestrator(
        task_manager=task_manager,
        settings_manager=DummySettingsManager(),
        pipeline_request_preparer=PipelineRequestPreparer(),
        pipeline_runner=runner,
        task_request_deduplicator=TaskRequestDeduplicator(),
        task_resume_service=TaskResumeService(),
    ), runner


def test_deduplication_key_keeps_all_pipeline_inputs():
    first = pipeline_request().model_dump(mode="json")
    second = pipeline_request().model_dump(mode="json")
    second["steps"][0]["params"]["proxy"] = "http://127.0.0.1:7890"
    assert TaskRequestDeduplicator.get_comparison_key(first) != TaskRequestDeduplicator.get_comparison_key(second)


@pytest.mark.asyncio
async def test_submit_pipeline_creates_new_attempt_after_completed_task():
    request = pipeline_request()
    completed = SimpleNamespace(
        id="task-1",
        type="pipeline",
        status="completed",
        message_code="pipeline_completed",
        message_params={},
        request_params=request.model_dump(mode="json"),
        revision=7,
    )
    manager = FakeTaskManager({completed.id: completed})
    orchestrator, _runner = create_orchestrator(manager)

    result = await orchestrator.submit_pipeline(request)

    assert result == task_submission_response(manager.serialize_task(manager.tasks["task-new"]), "queued", {})
    assert completed.status == "completed"
    assert manager.enqueued[0][0] == "task-new"


@pytest.mark.asyncio
async def test_concurrent_matching_submissions_create_one_active_task():
    manager = FakeTaskManager()
    orchestrator, _runner = create_orchestrator(manager)
    first, second = await asyncio.gather(
        orchestrator.submit_pipeline(pipeline_request()),
        orchestrator.submit_pipeline(pipeline_request()),
    )
    assert manager.created == 1
    assert first["task_id"] == second["task_id"] == "task-new"
    assert second["message_code"] == "already_active"


@pytest.mark.asyncio
async def test_resume_pipeline_rebuilds_runner_from_persisted_request():
    request = pipeline_request()
    paused = SimpleNamespace(
        id="task-paused",
        type="pipeline",
        status="paused",
        message_code="paused",
        message_params={},
        request_params=request.model_dump(mode="json"),
        checkpoint={
            "format": "mediaflow-pipeline-checkpoint-v1",
            "next_step_index": 0,
            "history": [],
        },
        revision=2,
    )
    manager = FakeTaskManager({paused.id: paused})
    orchestrator, runner = create_orchestrator(manager)

    result = await orchestrator.resume_task(paused.id)
    await manager.enqueued[0][1]()

    assert result["status"] == "pending"
    assert runner.calls[0][1] == paused.id
    assert [step.step_name for step in runner.calls[0][0]] == ["download"]
    assert runner.calls[0][2] == paused.checkpoint


@pytest.mark.asyncio
async def test_retry_failed_pipeline_creates_new_attempt_and_preserves_history():
    request = pipeline_request()
    failed = SimpleNamespace(
        id="failed-task",
        type="pipeline",
        name="Failed download",
        status="failed",
        revision=4,
        message_code="pipeline_step_failed",
        message_params={},
        request_params=request.model_dump(mode="json"),
    )
    manager = FakeTaskManager({failed.id: failed})
    orchestrator, _runner = create_orchestrator(manager)

    result = await orchestrator.retry_task(failed.id)

    assert result["task_id"] == "task-new"
    assert failed.status == "failed"
    assert failed.revision == 4
    assert manager.tasks["task-new"].request_params == request.model_dump(mode="json")

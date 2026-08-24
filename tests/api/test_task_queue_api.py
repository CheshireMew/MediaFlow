import time
import uuid
from pathlib import Path

from backend.config import settings
from backend.core.container import Services
from backend.models.task_model import Task
from backend.models.media_contracts import MediaReference, TaskArtifact, TaskResult
from backend.models.task_result_contracts import PipelineOutputs, TranscriptionOutput
from backend.services.task_control_service import TaskControlService
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_manager import TaskManager
from backend.services.task_queue_view import TaskQueueView
from backend.services.task_repository import TaskRepository
from backend.services.task_runtime_state import TaskRuntimeState


class SlowMockASR:
    def __init__(self, steps: int = 10, delay_s: float = 0.15):
        self.steps = steps
        self.delay_s = delay_s

    def transcribe(
        self,
        *,
        audio_path: str,
        model_name: str,
        device: str,
        engine: str,
        language: str | None,
        vad_filter: bool,
        task_id: str | None,
        initial_prompt: str | None,
        progress_callback,
    ) -> TaskResult:
        output_path = str(Path(audio_path).with_suffix(".srt"))

        for step in range(self.steps):
            time.sleep(self.delay_s)
            if progress_callback:
                percent = (step + 1) * (80 / self.steps)
                progress_callback(
                    percent,
                    "transcription_progress",
                    {"percent": round(percent, 1)},
                )

        return TaskResult(
            success=True,
            artifacts=[
                TaskArtifact(
                    kind="subtitle",
                    role="output",
                    ref=MediaReference(
                        path=output_path,
                        name=Path(output_path).name,
                        media_kind="subtitle",
                        role="output",
                    ),
                )
            ],
            outputs=PipelineOutputs(
                transcription=TranscriptionOutput(
                    task_id=task_id or "test-task",
                    language=language or "en",
                    duration=1,
                    segments=[],
                    text="ok",
                )
            ),
        )


def create_task_manager() -> TaskManager:
    return TaskManager(
        repository=TaskRepository(),
        event_publisher=TaskEventPublisher(),
        queue_view=TaskQueueView(),
        control_service=TaskControlService(),
        runtime_state=TaskRuntimeState(),
    )


def _create_audio_file(name: str) -> Path:
    workspace = settings.WORKSPACE_DIR
    workspace.mkdir(parents=True, exist_ok=True)
    audio_path = workspace / name
    audio_path.write_bytes(b"test-audio")
    return audio_path


def _media_ref(path: Path) -> dict:
    return {"path": str(path), "name": path.name, "type": "audio/mpeg", "media_kind": "audio"}


def test_task_api_uses_the_stable_error_contract(isolated_api_client):
    response = isolated_api_client.get("/api/v1/tasks/missing-task")

    assert response.status_code == 404
    assert response.json() == {
        "code": "task_not_found",
        "message": "Task not found",
        "details": {},
    }


def _transcribe_pipeline_request(path: Path, pipeline_id: str) -> dict:
    return {
        "pipeline_id": pipeline_id,
        "steps": [
            {
                "step_name": "transcribe",
                "params": {
                    "audio_ref": _media_ref(path),
                    "model": "base",
                    "device": "cpu",
                },
            }
        ],
    }


def _wait_for_task_status(
    client,
    task_id: str,
    expected_status: str,
    timeout_s: float = 5.0,
    poll_s: float = 0.1,
):
    deadline = time.time() + timeout_s
    last_payload = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/tasks/{task_id}")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["status"] == expected_status:
            return last_payload
        time.sleep(poll_s)
    raise AssertionError(f"Task {task_id} did not reach status {expected_status}. Last payload: {last_payload}")


def _wait_for_running_progress(client, task_id: str, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    last_payload = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/tasks/{task_id}")
        assert response.status_code == 200
        last_payload = response.json()
        if (
            last_payload["status"] == "running"
            and last_payload["queue_state"] == "running"
            and last_payload["progress"] > 0
        ):
            return last_payload
        time.sleep(0.05)
    raise AssertionError(
        f"Task {task_id} did not report running progress. Last payload: {last_payload}"
    )


def _wait_for_queue_summary(client, expected: dict, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    last_payload = None
    while time.time() < deadline:
        response = client.get("/api/v1/tasks/queue/summary")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload == expected:
            return last_payload
        time.sleep(0.05)
    raise AssertionError(f"Queue summary did not reach {expected}. Last payload: {last_payload}")


def _wait_for_queue_idle(
    client,
    timeout_s: float = 3.0,
    poll_s: float = 0.1,
):
    deadline = time.time() + timeout_s
    last_payload = None
    while time.time() < deadline:
        response = client.get("/api/v1/tasks/queue/summary")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["running"] == 0 and last_payload["queued"] == 0:
            return
        time.sleep(poll_s)
    raise AssertionError(f"Queue did not become idle. Last payload: {last_payload}")


def test_queue_summary_limits_concurrency_to_two(isolated_api_client, monkeypatch):
    audio_path = _create_audio_file("queue_api_test_audio.mp3")

    client = isolated_api_client
    assert client.get("/api/v1/tasks/queue/summary").status_code == 200
    slow_asr = SlowMockASR(steps=4, delay_s=0.25)
    monkeypatch.setattr(
        client.app.state.service_container.get(Services.ASR),
        "transcribe",
        slow_asr.transcribe,
    )

    task_ids: list[str] = []
    for index in range(3):
        response = client.post(
            "/api/v1/pipeline/run",
            json=_transcribe_pipeline_request(audio_path, f"queue_{index}"),
        )
        assert response.status_code == 200
        task_ids.append(response.json()["task_id"])

    _wait_for_queue_summary(
        client,
        {"max_concurrent": 2, "running": 2, "queued": 1},
    )

    tasks_by_id = {}
    for task_id in task_ids:
        task_response = client.get(f"/api/v1/tasks/{task_id}")
        assert task_response.status_code == 200
        tasks_by_id[task_id] = task_response.json()

    third_task = tasks_by_id[task_ids[2]]
    assert third_task["status"] == "pending"
    assert third_task["queue_state"] == "queued"
    assert third_task["queue_position"] == 1

    running_states = [tasks_by_id[task_id]["queue_state"] for task_id in task_ids[:2]]
    assert running_states == ["running", "running"]

    for task_id in task_ids[:2]:
        _wait_for_task_status(client, task_id, "completed", timeout_s=5.0)

    queue_summary_later = client.get("/api/v1/tasks/queue/summary")
    assert queue_summary_later.status_code == 200
    later_payload = queue_summary_later.json()
    assert later_payload["max_concurrent"] == 2
    assert later_payload["queued"] == 0
    assert later_payload["running"] in {0, 1}

    later_tasks = {}
    for task_id in task_ids:
        task_response = client.get(f"/api/v1/tasks/{task_id}")
        assert task_response.status_code == 200
        later_tasks[task_id] = task_response.json()
    assert later_tasks[task_ids[0]]["status"] == "completed"
    assert later_tasks[task_ids[1]]["status"] == "completed"
    assert later_tasks[task_ids[2]]["queue_state"] in {"running", "completed"}

    for task_id in task_ids:
        _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)

    for task_id in task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)

def test_pause_and_resume_transition_task_state(isolated_api_client, monkeypatch):
    audio_path = _create_audio_file("pause_resume_api_test_audio.mp3")

    client = isolated_api_client
    assert client.get("/api/v1/tasks/queue/summary").status_code == 200
    slow_asr = SlowMockASR(steps=10, delay_s=0.15)
    monkeypatch.setattr(
        client.app.state.service_container.get(Services.ASR),
        "transcribe",
        slow_asr.transcribe,
    )

    create_response = client.post(
        "/api/v1/pipeline/run",
        json=_transcribe_pipeline_request(audio_path, "pause_resume"),
    )
    assert create_response.status_code == 200
    task_id = create_response.json()["task_id"]

    _wait_for_running_progress(client, task_id)

    pause_response = client.post(f"/api/v1/tasks/{task_id}/pause")
    assert pause_response.status_code == 200
    assert pause_response.json()["message_code"] == "pause_requested"
    assert pause_response.json()["message_params"] == {}

    paused_payload = _wait_for_task_status(client, task_id, "paused")
    assert paused_payload["status"] == "paused"
    assert paused_payload["queue_state"] == "paused"
    paused_progress = paused_payload["progress"]
    assert paused_progress > 0

    resume_response = client.post(f"/api/v1/tasks/{task_id}/resume")
    assert resume_response.status_code == 200
    assert resume_response.json()["message_code"] == "resumed"
    assert resume_response.json()["message_params"] == {}

    resumed_payload = _wait_for_running_progress(client, task_id)
    assert resumed_payload["status"] == "running"
    assert resumed_payload["queue_state"] == "running"
    assert resumed_payload["progress"] >= paused_progress

    final_payload = _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)
    assert final_payload["status"] == "completed"
    assert final_payload["queue_state"] == "completed"
    assert final_payload["progress"] == 100.0

    client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)


def test_load_runtime_tasks_marks_interrupted_work_as_paused_and_snapshot_reflects_it(monkeypatch):
    running_task = Task(
        id=str(uuid.uuid4())[:8],
        name="running-task",
        type="pipeline",
        status="running",
        progress=32.0,
        message_code="transcription_progress",
        message_params={"percent": 32},
        request_params=_transcribe_pipeline_request(Path("x.mp3"), "running-task"),
    )
    pending_task = Task(
        id=str(uuid.uuid4())[:8],
        name="pending-task",
        type="pipeline",
        status="pending",
        progress=0.0,
        message_code="queued",
        message_params={},
        request_params=_transcribe_pipeline_request(Path("y.mp3"), "pending-task"),
    )
    paused_task = Task(
        id=str(uuid.uuid4())[:8],
        name="paused-task",
        type="pipeline",
        status="paused",
        progress=12.0,
        message_code="paused",
        message_params={},
        request_params=_transcribe_pipeline_request(Path("z.mp3"), "paused-task"),
    )
    fake_tasks = [running_task, pending_task, paused_task]

    async def fake_load_runtime_tasks(self):
        tasks_by_id = {}
        for task in fake_tasks:
            if task.status in ["running", "pending"]:
                task.status = "paused"
                task.message_code = "interrupted_by_restart"
                task.message_params = {}
                task.cancelled = False
            tasks_by_id[task.id] = task
        return tasks_by_id

    monkeypatch.setattr(
        "backend.services.task_repository.TaskRepository.load_runtime_tasks",
        fake_load_runtime_tasks,
    )

    tm = create_task_manager()

    import asyncio

    asyncio.run(tm.load_runtime_tasks())

    assert tm.get_task(running_task.id).status == "paused"
    assert tm.get_task(running_task.id).message_code == "interrupted_by_restart"
    assert tm.get_task(pending_task.id).status == "paused"
    assert tm.get_task(pending_task.id).message_code == "interrupted_by_restart"
    assert tm.get_task(paused_task.id).status == "paused"
    assert tm.get_task(paused_task.id).message_code == "paused"

    snapshot = {task.id: task for task in tm.get_tasks_snapshot()}
    assert snapshot[running_task.id].queue_state == "paused"
    assert snapshot[pending_task.id].queue_state == "paused"
    assert snapshot[paused_task.id].queue_state == "paused"

import time
import uuid
from pathlib import Path

from backend.config import settings
from backend.core.container import Services, container
from backend.models.task_model import Task
from backend.models.schemas import FileRef, TaskResult
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
        audio_path: str,
        model_name: str = "base",
        device: str = "cpu",
        language: str = None,
        task_id: str = None,
        initial_prompt: str = None,
        progress_callback=None,
        generate_peaks: bool = True,
    ) -> TaskResult:
        output_path = str(Path(audio_path).with_suffix(".srt"))

        for step in range(self.steps):
            time.sleep(self.delay_s)
            if progress_callback:
                percent = (step + 1) * (80 / self.steps)
                progress_callback(percent, f"mock step {step + 1}")

        return TaskResult(
            success=True,
            files=[FileRef(type="subtitle", path=output_path, label="transcription")],
            meta={"segments": [], "text": "ok", "language": language or "en"},
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
            time.sleep(0.1)
            return
        time.sleep(poll_s)
    raise AssertionError(f"Queue did not become idle. Last payload: {last_payload}")


def test_queue_summary_limits_concurrency_to_two(isolated_api_client):
    audio_path = _create_audio_file("queue_api_test_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=4, delay_s=0.25))

    task_ids: list[str] = []
    for _ in range(3):
        response = client.post(
            "/api/v1/transcribe/",
            json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
        )
        assert response.status_code == 200
        task_ids.append(response.json()["task_id"])

    time.sleep(0.15)

    queue_summary = client.get("/api/v1/tasks/queue/summary")
    assert queue_summary.status_code == 200
    assert queue_summary.json() == {"max_concurrent": 2, "running": 2, "queued": 1}

    tasks_response = client.get("/api/v1/tasks/")
    assert tasks_response.status_code == 200
    tasks = [task for task in tasks_response.json() if task["id"] in task_ids]
    tasks_by_id = {task["id"]: task for task in tasks}

    third_task = tasks_by_id[task_ids[2]]
    assert third_task["status"] == "pending"
    assert third_task["queue_state"] == "queued"
    assert third_task["queue_position"] == 1

    running_states = [tasks_by_id[task_id]["queue_state"] for task_id in task_ids[:2]]
    assert running_states == ["running", "running"]

    time.sleep(1.4)

    queue_summary_later = client.get("/api/v1/tasks/queue/summary")
    assert queue_summary_later.status_code == 200
    later_payload = queue_summary_later.json()
    assert later_payload["max_concurrent"] == 2
    assert later_payload["queued"] == 0
    assert later_payload["running"] in {0, 1}

    later_tasks = {
        task["id"]: task
        for task in client.get("/api/v1/tasks/").json()
        if task["id"] in task_ids
    }
    assert later_tasks[task_ids[0]]["status"] == "completed"
    assert later_tasks[task_ids[1]]["status"] == "completed"
    assert later_tasks[task_ids[2]]["queue_state"] in {"running", "completed"}

    for task_id in task_ids:
        _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)

    for task_id in task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)

def test_pause_and_resume_transition_task_state(isolated_api_client):
    audio_path = _create_audio_file("pause_resume_api_test_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=10, delay_s=0.15))

    create_response = client.post(
        "/api/v1/transcribe/",
        json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
    )
    assert create_response.status_code == 200
    task_id = create_response.json()["task_id"]

    time.sleep(0.35)

    before_pause = client.get(f"/api/v1/tasks/{task_id}")
    assert before_pause.status_code == 200
    before_payload = before_pause.json()
    assert before_payload["status"] == "running"
    assert before_payload["queue_state"] == "running"
    assert before_payload["progress"] > 0

    pause_response = client.post(f"/api/v1/tasks/{task_id}/pause")
    assert pause_response.status_code == 200

    time.sleep(0.30)

    paused = client.get(f"/api/v1/tasks/{task_id}")
    assert paused.status_code == 200
    paused_payload = paused.json()
    assert paused_payload["status"] == "paused"
    assert paused_payload["queue_state"] == "paused"
    paused_progress = paused_payload["progress"]
    assert paused_progress > 0

    resume_response = client.post(f"/api/v1/tasks/{task_id}/resume")
    assert resume_response.status_code == 200

    time.sleep(0.20)

    resumed = client.get(f"/api/v1/tasks/{task_id}")
    assert resumed.status_code == 200
    resumed_payload = resumed.json()
    assert resumed_payload["status"] == "running"
    assert resumed_payload["queue_state"] == "running"
    assert resumed_payload["progress"] <= paused_progress

    final_payload = _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)
    assert final_payload["status"] == "completed"
    assert final_payload["queue_state"] == "completed"
    assert final_payload["progress"] == 100.0

    client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)


def test_load_tasks_marks_interrupted_work_as_paused_and_snapshot_reflects_it(monkeypatch):
    running_task = Task(
        id=str(uuid.uuid4())[:8],
        name="running-task",
        type="transcribe",
        status="running",
        progress=32.0,
        message="Interrupted mid-run",
        request_params={"audio_path": "x.mp3", "model": "base", "device": "cpu"},
    )
    pending_task = Task(
        id=str(uuid.uuid4())[:8],
        name="pending-task",
        type="transcribe",
        status="pending",
        progress=0.0,
        message="Queued",
        request_params={"audio_path": "y.mp3", "model": "base", "device": "cpu"},
    )
    paused_task = Task(
        id=str(uuid.uuid4())[:8],
        name="paused-task",
        type="transcribe",
        status="paused",
        progress=12.0,
        message="Paused by user",
        request_params={"audio_path": "z.mp3", "model": "base", "device": "cpu"},
    )
    fake_tasks = [running_task, pending_task, paused_task]

    async def fake_load_all(self):
        tasks_by_id = {}
        for task in fake_tasks:
            if task.status in ["running", "pending"]:
                task.status = "paused"
                task.message = "Interrupted by restart"
                task.cancelled = False
            tasks_by_id[task.id] = task
        return tasks_by_id

    monkeypatch.setattr(
        "backend.services.task_repository.TaskRepository.load_all",
        fake_load_all,
    )

    tm = create_task_manager()

    import asyncio

    asyncio.run(tm.load_tasks())

    assert tm.get_task(running_task.id).status == "paused"
    assert tm.get_task(running_task.id).message == "Interrupted by restart"
    assert tm.get_task(pending_task.id).status == "paused"
    assert tm.get_task(pending_task.id).message == "Interrupted by restart"
    assert tm.get_task(paused_task.id).status == "paused"
    assert tm.get_task(paused_task.id).message == "Paused by user"

    snapshot = {task["id"]: task for task in tm.get_tasks_snapshot()}
    assert snapshot[running_task.id]["queue_state"] == "paused"
    assert snapshot[pending_task.id]["queue_state"] == "paused"
    assert snapshot[paused_task.id]["queue_state"] == "paused"

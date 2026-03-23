import pytest
import asyncio
import time
import queue
import threading
from pathlib import Path
from fastapi.testclient import TestClient
from backend.core.container import container, Services
from backend.core.runtime_access import RuntimeServices
from backend.models.schemas import FileRef, TaskResult


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


def _create_audio_file(name: str) -> Path:
    workspace = Path("E:/Work/Code/Mediaflow/workspace")
    workspace.mkdir(parents=True, exist_ok=True)
    audio_path = workspace / name
    audio_path.write_bytes(b"test-audio")
    return audio_path


def _receive_until(websocket, predicate, limit: int = 30):
    last_message = None
    for _ in range(limit):
        result_queue: queue.Queue = queue.Queue(maxsize=1)

        def _recv():
            try:
                result_queue.put(("message", websocket.receive_json()))
            except Exception as exc:  # pragma: no cover - test helper failure path
                result_queue.put(("error", exc))

        receiver = threading.Thread(target=_recv, daemon=True)
        receiver.start()
        receiver.join(timeout=5)
        if receiver.is_alive():
            raise AssertionError(
                f"Timed out waiting for websocket payload. Last message: {last_message}"
            )

        kind, value = result_queue.get_nowait()
        if kind == "error":
            raise value
        last_message = value
        if predicate(last_message):
            return last_message
    raise AssertionError(f"Did not receive expected websocket payload. Last message: {last_message}")


def _wait_for_terminal_tasks(client, task_ids: list[str], timeout_s: float = 10.0):
    terminal_states = {"completed", "failed", "cancelled", "paused"}
    deadline = time.time() + timeout_s

    while time.time() < deadline:
        remaining = []
        for task_id in task_ids:
            response = client.get(f"/api/v1/tasks/{task_id}")
            if response.status_code == 404:
                continue
            if response.json()["status"] not in terminal_states:
                remaining.append(task_id)
        if not remaining:
            return
        time.sleep(0.1)

    raise AssertionError(f"Tasks did not reach terminal state before timeout: {remaining}")


def _wait_for_queue_idle(client, timeout_s: float = 3.0):
    deadline = time.time() + timeout_s
    last_payload = None
    while time.time() < deadline:
        response = client.get("/api/v1/tasks/queue/summary")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["running"] == 0 and last_payload["queued"] == 0:
            time.sleep(0.1)
            return
        time.sleep(0.1)
    raise AssertionError(f"Queue did not become idle. Last payload: {last_payload}")

def test_websocket_connection(isolated_api_client: TestClient):
    with isolated_api_client.websocket_connect("/api/v1/ws/tasks") as websocket:
        # 1. Connection established
        notifier = RuntimeServices.ws_notifier()
        assert len(notifier.active_connections) == 1
        
        # 2. Simulate task update broadcast
        # Since 'broadcast_task_update' is async, we need to run it. 
        # But in a synchronous test environment, we might not see the message immediately 
        # unless we trigger it via an API or run the loop.
        # However, TestClient websockets run in a separate thread/loop usually.
        
        # Let's try sending a message from client
        websocket.send_json({"action": "ping"})
        
        # 3. Disconnect
        websocket.close()

    notifier = RuntimeServices.ws_notifier()
    for _ in range(10):
        if len(notifier.active_connections) == 0:
            break
        time.sleep(0.01)
    assert len(notifier.active_connections) == 0

@pytest.mark.asyncio
async def test_task_update_broadcast(isolated_api_client: TestClient):
    # This test verifies the TaskManager's logic specifically not the full WS transport
    # which is harder to test async without a running server.
    
    class MockWS:
        def __init__(self):
            self.sent_messages = []
            
        async def accept(self):
            pass

        async def send_json(self, data):
            self.sent_messages.append(data)
            
    mock_ws = MockWS()
    notifier = RuntimeServices.ws_notifier()
    task_manager = RuntimeServices.task_manager()
    await notifier.connect(mock_ws)
    
    from backend.models.task_model import Task
    import time
    
    # Create a real Task object
    task_manager.tasks["test_task"] = Task(
        id="test_task", 
        type="test", 
        status="pending", 
        created_at=time.time(), 
        message="Created"
    )
    
    await task_manager.update_task("test_task", status="running", message="Test Message")
    
    print(f"DEBUG MESSAGES: {mock_ws.sent_messages}")
    msg = mock_ws.sent_messages[-1]
    assert msg["type"] == "update"
    assert msg["task"]["id"] == "test_task"
    assert msg["task"]["status"] == "running"
    
    notifier.disconnect(mock_ws)


def test_websocket_pushes_queue_position_and_pause_resume_updates(isolated_api_client):
    audio_path = _create_audio_file("ws_queue_pause_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=10, delay_s=0.15))
    created_task_ids = []

    with client.websocket_connect("/api/v1/ws/tasks") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["type"] == "snapshot"

            for _ in range(3):
                response = client.post(
                    "/api/v1/transcribe/",
                    json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
                )
                assert response.status_code == 200
                created_task_ids.append(response.json()["task_id"])

            queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("queue_state") == "queued"
                    and message.get("task", {}).get("queue_position") == 1
                ),
                limit=40,
            )
            queued_task_id = queued_message["task"]["id"]
            assert queued_task_id == created_task_ids[2]

            pause_target_id = created_task_ids[0]
            deadline = time.time() + 3.0
            while time.time() < deadline:
                task_response = client.get(f"/api/v1/tasks/{pause_target_id}")
                assert task_response.status_code == 200
                task_payload = task_response.json()
                if task_payload["queue_state"] == "running":
                    break
                time.sleep(0.05)
            else:
                raise AssertionError(f"Task {pause_target_id} did not enter running state in time")
            assert pause_target_id != queued_task_id

            websocket.send_json({"action": "pause", "task_id": pause_target_id})

            paused_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == pause_target_id
                    and message.get("task", {}).get("status") == "paused"
                    and message.get("task", {}).get("queue_state") == "paused"
                ),
                limit=60,
            )
            assert paused_message["task"]["message"] == "Task paused by user"

            resume_response = client.post(f"/api/v1/tasks/{pause_target_id}/resume")
            assert resume_response.status_code == 200

            resumed_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == pause_target_id
                    and message.get("task", {}).get("status") == "running"
                    and message.get("task", {}).get("queue_state") == "running"
                ),
                limit=60,
            )
            assert resumed_message["task"]["progress"] >= 0

    _wait_for_terminal_tasks(client, created_task_ids)
    for task_id in created_task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)


def test_websocket_pushes_cancel_updates_for_running_and_queued_tasks(isolated_api_client):
    audio_path = _create_audio_file("ws_cancel_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=10, delay_s=0.15))
    created_task_ids = []

    with client.websocket_connect("/api/v1/ws/tasks") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["type"] == "snapshot"

            for _ in range(3):
                response = client.post(
                    "/api/v1/transcribe/",
                    json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
                )
                assert response.status_code == 200
                created_task_ids.append(response.json()["task_id"])

            queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("queue_state") == "queued"
                    and message.get("task", {}).get("queue_position") == 1
                ),
                limit=40,
            )
            assert queued_message["task"]["id"] == created_task_ids[2]

            running_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[0]
                    and message.get("task", {}).get("queue_state") == "running"
                ),
                limit=40,
            )
            running_task_id = running_message["task"]["id"]

            websocket.send_json({"action": "cancel", "task_id": created_task_ids[2]})
            cancelled_queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("status") == "cancelled"
                    and message.get("task", {}).get("queue_state") == "cancelled"
                ),
                limit=40,
            )
            assert cancelled_queued_message["task"]["message"] == "Cancelled in queue"

            websocket.send_json({"action": "cancel", "task_id": running_task_id})
            cancelled_running_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == running_task_id
                    and message.get("task", {}).get("status") == "cancelled"
                    and message.get("task", {}).get("queue_state") == "cancelled"
                ),
                limit=60,
            )
            assert cancelled_running_message["task"]["message"] == "Task cancelled by user"

    _wait_for_terminal_tasks(client, created_task_ids)
    for task_id in created_task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)


def test_websocket_pushes_pause_all_updates_for_running_and_queued_tasks(isolated_api_client):
    audio_path = _create_audio_file("ws_pause_all_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=10, delay_s=0.15))
    created_task_ids = []

    with client.websocket_connect("/api/v1/ws/tasks") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["type"] == "snapshot"

            for _ in range(3):
                response = client.post(
                    "/api/v1/transcribe/",
                    json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
                )
                assert response.status_code == 200
                created_task_ids.append(response.json()["task_id"])

            queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("queue_state") == "queued"
                    and message.get("task", {}).get("queue_position") == 1
                ),
                limit=40,
            )
            assert queued_message["task"]["id"] == created_task_ids[2]

            for task_id in created_task_ids[:2]:
                running_message = _receive_until(
                    websocket,
                    lambda message, expected_task_id=task_id: (
                        message.get("type") == "update"
                        and message.get("task", {}).get("id") == expected_task_id
                        and message.get("task", {}).get("queue_state") == "running"
                    ),
                    limit=40,
                )
                assert running_message["task"]["id"] == task_id

            pause_all_response = client.post("/api/v1/tasks/pause-all")
            assert pause_all_response.status_code == 200
            assert pause_all_response.json()["count"] == 3

            paused_queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("status") == "paused"
                    and message.get("task", {}).get("queue_state") == "paused"
                ),
                limit=60,
            )
            assert paused_queued_message["task"]["message"] == "Paused in queue"

            for task_id in created_task_ids[:2]:
                paused_running_message = _receive_until(
                    websocket,
                    lambda message, expected_task_id=task_id: (
                        message.get("type") == "update"
                        and message.get("task", {}).get("id") == expected_task_id
                        and message.get("task", {}).get("status") == "paused"
                        and message.get("task", {}).get("queue_state") == "paused"
                    ),
                    limit=60,
                )
                assert paused_running_message["task"]["progress"] >= 0

    _wait_for_terminal_tasks(client, created_task_ids)
    for task_id in created_task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)


def test_websocket_delete_sequence_for_running_and_queued_tasks(isolated_api_client):
    audio_path = _create_audio_file("ws_delete_audio.mp3")

    client = isolated_api_client
    container.override(Services.ASR, SlowMockASR(steps=10, delay_s=0.15))
    created_task_ids = []

    with client.websocket_connect("/api/v1/ws/tasks") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["type"] == "snapshot"

            for _ in range(3):
                response = client.post(
                    "/api/v1/transcribe/",
                    json={"audio_path": str(audio_path), "model": "base", "device": "cpu"},
                )
                assert response.status_code == 200
                created_task_ids.append(response.json()["task_id"])

            queued_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[2]
                    and message.get("task", {}).get("queue_state") == "queued"
                    and message.get("task", {}).get("queue_position") == 1
                ),
                limit=40,
            )
            assert queued_message["task"]["id"] == created_task_ids[2]

            running_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == created_task_ids[0]
                    and message.get("task", {}).get("queue_state") == "running"
                ),
                limit=40,
            )
            running_task_id = running_message["task"]["id"]

            queued_delete_response = client.delete(f"/api/v1/tasks/{created_task_ids[2]}")
            assert queued_delete_response.status_code == 200

            queued_delete_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "delete"
                    and message.get("task_id") == created_task_ids[2]
                ),
                limit=40,
            )
            assert queued_delete_message["task_id"] == created_task_ids[2]

            running_delete_response = client.delete(f"/api/v1/tasks/{running_task_id}")
            assert running_delete_response.status_code == 200

            cancelled_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "update"
                    and message.get("task", {}).get("id") == running_task_id
                    and message.get("task", {}).get("status") == "cancelled"
                    and message.get("task", {}).get("queue_state") == "cancelled"
                ),
                limit=60,
            )
            assert cancelled_message["task"]["message"] == "Task cancelled by user"

            running_delete_message = _receive_until(
                websocket,
                lambda message: (
                    message.get("type") == "delete"
                    and message.get("task_id") == running_task_id
                ),
                limit=60,
            )
            assert running_delete_message["task_id"] == running_task_id

    _wait_for_terminal_tasks(client, created_task_ids[:2])
    for task_id in created_task_ids:
        client.delete(f"/api/v1/tasks/{task_id}")
    _wait_for_queue_idle(client)

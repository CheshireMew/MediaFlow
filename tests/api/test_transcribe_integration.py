import time
from pathlib import Path

from backend.core.container import Services, container
from backend.models.schemas import FileRef, TaskResult


class MockASRService:
    def transcribe(
        self,
        audio_path: str,
        model_name: str = "base",
        device: str = "cpu",
        language: str | None = None,
        task_id: str | None = None,
        initial_prompt: str | None = None,
        progress_callback=None,
        generate_peaks: bool = True,
    ) -> TaskResult:
        output_path = str(Path(audio_path).with_suffix(".srt"))
        if progress_callback:
            progress_callback(50, "mock transcribing")
            progress_callback(100, "mock completed")

        return TaskResult(
            success=True,
            files=[FileRef(type="subtitle", path=output_path, label="transcription")],
            meta={
                "task_id": task_id or "test_task_id",
                "language": language or "en",
                "segments": [
                    {"id": "1", "start": 0.0, "end": 1.0, "text": "Hello"},
                    {"id": "2", "start": 1.0, "end": 2.0, "text": "World"},
                ],
                "text": "Hello\nWorld",
            },
        )


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
    raise AssertionError(
        f"Task {task_id} did not reach status {expected_status}. Last payload: {last_payload}"
    )


def test_transcribe_flow_integration(isolated_api_client, tmp_path):
    client = isolated_api_client
    container.override(Services.ASR, MockASRService())

    audio_file = tmp_path / "test_audio.mp3"
    audio_file.write_text("dummy content", encoding="utf-8")

    response = client.post(
        "/api/v1/transcribe/",
        json={
            "audio_path": str(audio_file),
            "model": "base",
            "language": "en",
            "device": "cpu",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"
    assert "task_id" in data

    task_id = data["task_id"]
    task_payload = _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)

    assert task_payload["progress"] == 100.0
    assert task_payload["result"] is not None
    assert len(task_payload["result"]["meta"]["segments"]) == 2
    assert task_payload["result"]["meta"]["segments"][0]["text"] == "Hello"
    assert task_payload["result"]["meta"]["language"] == "en"

    delete_response = client.delete(f"/api/v1/tasks/{task_id}")
    assert delete_response.status_code == 200


def test_transcribe_rejects_missing_audio_path_with_400(isolated_api_client):
    response = isolated_api_client.post(
        "/api/v1/transcribe/",
        json={
            "audio_path": None,
            "model": "base",
            "device": "cpu",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "audio path is required"

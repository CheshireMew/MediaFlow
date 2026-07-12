import time
from pathlib import Path

from backend.core.container import Services, container
from backend.models.schemas import MediaReference, TaskArtifact, TaskResult


class MockASRService:
    def __init__(self):
        self.transcribe_calls = []
        self.segment_calls = []

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
        self.transcribe_calls.append(
            {
                "audio_path": audio_path,
                "model_name": model_name,
                "device": device,
                "engine": engine,
                "language": language,
                "vad_filter": vad_filter,
                "task_id": task_id,
                "initial_prompt": initial_prompt,
            }
        )
        output_path = str(Path(audio_path).with_suffix(".srt"))
        if progress_callback:
            progress_callback(50, "transcription_progress", {"percent": 50})
            progress_callback(100, "transcription_completed", {})

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

    def transcribe_segment(
        self,
        *,
        audio_path: str,
        start: float,
        end: float,
        model_name: str,
        device: str,
        engine: str,
        language: str | None,
        vad_filter: bool,
        task_id: str | None,
        initial_prompt: str | None,
        progress_callback,
    ) -> TaskResult:
        self.segment_calls.append(
            {
                "audio_path": audio_path,
                "start": start,
                "end": end,
                "model_name": model_name,
                "device": device,
                "engine": engine,
                "language": language,
                "vad_filter": vad_filter,
                "task_id": task_id,
                "initial_prompt": initial_prompt,
                "progress_callback": progress_callback,
            }
        )
        return TaskResult(
            success=True,
            meta={
                "segments": [
                    {"id": "segment", "start": start, "end": end, "text": "Hello"}
                ],
                "text": "Hello",
                "language": language or "en",
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


def test_transcribe_flow_integration(isolated_api_client, tmp_path, monkeypatch):
    client = isolated_api_client
    assert client.get("/api/v1/tasks/queue/summary").status_code == 200
    executor = container.get(Services.TASK_OPERATION_EXECUTOR)
    asr_service = MockASRService()
    monkeypatch.setattr(executor, "_asr_service", asr_service)

    audio_file = tmp_path / "api_runtime" / "workspace" / "test_audio.mp3"
    audio_file.write_text("dummy content", encoding="utf-8")

    response = client.post(
        "/api/v1/transcribe/",
        json={
            "audio_ref": {"path": str(audio_file), "name": audio_file.name, "type": "audio/mpeg", "media_kind": "audio"},
            "model": "base",
            "language": "en",
            "device": "cpu",
            "engine": "cli",
            "vad_filter": False,
            "initial_prompt": "MediaFlow names",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"
    assert "task_id" in data
    assert data["message_code"] == "queued"
    assert data["message_params"] == {}
    assert "message" not in data

    task_id = data["task_id"]
    task_payload = _wait_for_task_status(client, task_id, "completed", timeout_s=4.0)

    assert task_payload["progress"] == 100.0
    assert task_payload["result"] is not None
    assert len(task_payload["result"]["meta"]["segments"]) == 2
    assert task_payload["result"]["meta"]["segments"][0]["text"] == "Hello"
    assert task_payload["result"]["meta"]["language"] == "en"
    assert asr_service.transcribe_calls == [
        {
            "audio_path": str(audio_file),
            "model_name": "base",
            "device": "cpu",
            "engine": "cli",
            "language": "en",
            "vad_filter": False,
            "task_id": task_id,
            "initial_prompt": "MediaFlow names",
        }
    ]

    delete_response = client.delete(f"/api/v1/tasks/{task_id}")
    assert delete_response.status_code == 200


def test_transcribe_rejects_missing_audio_ref_with_422(isolated_api_client):
    response = isolated_api_client.post(
        "/api/v1/transcribe/",
        json={
            "model": "base",
            "device": "cpu",
        },
    )

    assert response.status_code == 422


def test_transcribe_segment_forwards_the_canonical_asr_contract(
    isolated_api_client,
    tmp_path,
    monkeypatch,
):
    executor = container.get(Services.TASK_OPERATION_EXECUTOR)
    asr_service = MockASRService()
    monkeypatch.setattr(executor, "_asr_service", asr_service)

    audio_file = tmp_path / "api_runtime" / "workspace" / "segment.mp3"
    audio_file.parent.mkdir(parents=True, exist_ok=True)
    audio_file.write_text("dummy content", encoding="utf-8")

    response = isolated_api_client.post(
        "/api/v1/transcribe/segment",
        json={
            "audio_ref": {
                "path": str(audio_file),
                "name": audio_file.name,
                "type": "audio/mpeg",
                "media_kind": "audio",
            },
            "start": 2.0,
            "end": 8.0,
            "model": "small",
            "language": "ja",
            "device": "cuda",
            "engine": "cli",
            "vad_filter": False,
            "initial_prompt": "固有名詞",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert asr_service.segment_calls == [
        {
            "audio_path": str(audio_file),
            "start": 2.0,
            "end": 8.0,
            "model_name": "small",
            "device": "cuda",
            "engine": "cli",
            "language": "ja",
            "vad_filter": False,
            "task_id": None,
            "initial_prompt": "固有名詞",
            "progress_callback": None,
        }
    ]

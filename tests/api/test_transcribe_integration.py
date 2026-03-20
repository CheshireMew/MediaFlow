from unittest.mock import patch
from backend.services.task_manager import task_manager
from backend.models.schemas import TaskResult, SubtitleSegment, FileRef

def test_transcribe_flow_integration(client, tmp_path):
    # 1. Setup Mock ASR Service
    # We mock the 'transcribe' method of the singleton instance used in the API
    with patch("src.services.asr.asr_service.transcribe") as mock_transcribe:
        # Define what the mock returns
        mock_result = TaskResult(
            success=True,
            files=[FileRef(type="subtitle", path="/tmp/test.srt", label="transcription")],
            meta={
                "task_id": "test_task_id",
                "language": "en",
                "segments": [
                    SubtitleSegment(id="1", start=0.0, end=1.0, text="Hello").model_dump(),
                    SubtitleSegment(id="2", start=1.0, end=2.0, text="World").model_dump(),
                ],
                "text": "Hello\nWorld",
            }
        )
        mock_transcribe.return_value = mock_result
        
        # 2. Create a dummy audio file
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_text("dummy content")
        
        # 3. Make the API Request
        payload = {
            "audio_path": str(audio_file),
            "model": "base",
            "language": "en"
        }
        
        # Explicitly clear tasks before test
        task_manager.tasks = {}
        
        response = client.post("/api/v1/transcribe/", json=payload)
        
        # 4. Verify Immediate Response
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["status"] == "pending"
        task_id = data["task_id"]
        
        # 5. Verify Background Execution
        # In TestClient, background tasks run synchronously after the response.
        # So by this line, the task should be done (or failed).
        
        # Check Task Manager State
        task = task_manager.get_task(task_id)
        assert task is not None
        
        # If the background task ran, status should be 'completed'
        # Debugging note: If this fails, it might be due to async loop mocking issues
        assert task.status == "completed"
        assert task.progress == 100.0
        assert task.result is not None
        assert len(task.result["meta"]["segments"]) == 2
        assert task.result["meta"]["segments"][0]["text"] == "Hello"
        
        # Verify Mock was called
        mock_transcribe.assert_called_once()
        # Verify arguments passed to transcribe
        call_args = mock_transcribe.call_args
        assert call_args.kwargs["audio_path"] == str(audio_file)
        assert call_args.kwargs["model_name"] == "base"

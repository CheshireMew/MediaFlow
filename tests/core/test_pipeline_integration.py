import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.core.pipeline import PipelineRunner
from backend.models.schemas import DownloadStepRequest, DownloadParams, TranscribeStepRequest, TranscribeParams, TaskResult, FileRef
from backend.core.container import container, Services

@pytest.mark.asyncio
async def test_pipeline_orchestration_flow():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.is_cancelled = MagicMock(return_value=False)
    container.override(Services.TASK_MANAGER, mock_tm)
    container.override(Services.DOWNLOADER, downloader)
    container.override(Services.ASR, asr)
    runner = PipelineRunner(task_manager=mock_tm)

    downloader.download = AsyncMock(return_value=TaskResult(
        success=True,
        files=[FileRef(type="video", path="/tmp/video.mp4", label="source")],
        meta={"filename": "video.mp4", "title": "Test Video"}
    ))
    asr.transcribe.return_value = TaskResult(
        success=True,
        files=[FileRef(type="subtitle", path="/tmp/video.srt", label="transcription")],
        meta={"text": "Transcribed Text", "segments": []}
    )

    steps = [
        DownloadStepRequest(step_name="download", params=DownloadParams(url="http://example.com/video")),
        TranscribeStepRequest(step_name="transcribe", params=TranscribeParams(model="tiny"))
    ]

    result = await runner.run(steps, task_id="task-123")

    assert result["status"] == "completed"
    assert result["history"] == ["download", "transcribe"]
    downloader.download.assert_called_once()
    asr.transcribe.assert_called_once()
    call_args = asr.transcribe.call_args
    assert call_args.kwargs["audio_path"] == "/tmp/video.mp4"

    last_update = mock_tm.update_task.call_args_list[-1]
    assert last_update.kwargs["status"] == "completed"
    assert last_update.kwargs["result"]["meta"]["text"] == "Transcribed Text"
    assert last_update.kwargs["result"]["meta"]["transcript"] == "Transcribed Text"

    container.reset()


@pytest.mark.asyncio
async def test_pipeline_orchestration_with_audio_download():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.is_cancelled = MagicMock(return_value=False)
    container.override(Services.TASK_MANAGER, mock_tm)
    container.override(Services.DOWNLOADER, downloader)
    container.override(Services.ASR, asr)
    runner = PipelineRunner(task_manager=mock_tm)

    downloader.download = AsyncMock(
        return_value=TaskResult(
            success=True,
            files=[FileRef(type="audio", path="/tmp/audio.m4a", label="source")],
            meta={"filename": "audio.m4a", "title": "Test Audio"},
        )
    )
    asr.transcribe.return_value = TaskResult(
        success=True,
        files=[FileRef(type="subtitle", path="/tmp/audio.srt", label="transcription")],
        meta={"text": "Transcribed Audio", "segments": []},
    )

    steps = [
        DownloadStepRequest(
            step_name="download",
            params=DownloadParams(url="http://example.com/audio", resolution="audio"),
        ),
        TranscribeStepRequest(step_name="transcribe", params=TranscribeParams(model="tiny")),
    ]

    result = await runner.run(steps, task_id="task-audio-123")

    assert result["status"] == "completed"
    assert result["history"] == ["download", "transcribe"]
    asr.transcribe.assert_called_once()
    call_args = asr.transcribe.call_args
    assert call_args.kwargs["audio_path"] == "/tmp/audio.m4a"

    last_update = mock_tm.update_task.call_args_list[-1]
    assert last_update.kwargs["status"] == "completed"
    assert last_update.kwargs["result"]["meta"]["text"] == "Transcribed Audio"
    result_files = last_update.kwargs["result"]["files"]
    assert any(f["type"] == "audio" for f in result_files)

    container.reset()

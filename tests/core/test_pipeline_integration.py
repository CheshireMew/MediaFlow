import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.core.pipeline import PipelineRunner
from backend.models.schemas import (
    DownloadParams,
    MediaReference,
    PipelineStepRequest,
    TaskArtifact,
    TaskResult,
    TranscribeParams,
)
from backend.core.steps.download import DownloadStep
from backend.core.steps.registry import StepRegistry
from backend.core.steps.transcribe import TranscribeStep


def _pipeline_runner(*, task_manager, downloader=None, asr=None):
    steps = []
    if downloader is not None:
        steps.append(DownloadStep(downloader=downloader, task_manager=task_manager))
    if asr is not None:
        steps.append(TranscribeStep(asr_service=asr, task_manager=task_manager))
    return PipelineRunner(
        task_manager=task_manager,
        step_registry=StepRegistry(steps),
    )


def _artifact(kind: str, path: str) -> TaskArtifact:
    return TaskArtifact(
        kind=kind,
        role="output",
        ref=MediaReference(
            path=path,
            name=path.rsplit("/", 1)[-1],
            media_kind=kind,
            role="output",
        ),
    )

@pytest.mark.asyncio
async def test_pipeline_orchestration_flow():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, downloader=downloader, asr=asr)

    downloader.download = AsyncMock(return_value=TaskResult(
        success=True,
        artifacts=[_artifact("video", "/tmp/video.mp4")],
        meta={"filename": "video.mp4", "title": "Test Video"}
    ))
    asr.transcribe.return_value = TaskResult(
        success=True,
        artifacts=[_artifact("subtitle", "/tmp/video.srt")],
        meta={"text": "Transcribed Text", "segments": []}
    )

    steps = [
        PipelineStepRequest(step_name="download", params=DownloadParams(url="http://example.com/video")),
        PipelineStepRequest(step_name="transcribe", params=TranscribeParams(model="tiny"))
    ]

    result = await runner.run(steps, task_id="task-123")

    assert result["status"] == "completed"
    assert result["history"] == ["download", "transcribe"]
    downloader.download.assert_called_once()
    asr.transcribe.assert_called_once()
    call_args = asr.transcribe.call_args
    assert call_args.kwargs["audio_path"] == "/tmp/video.mp4"
    assert call_args.kwargs["engine"] == "builtin"

    last_update = mock_tm.update_task.call_args_list[-1]
    assert last_update.kwargs["status"] == "completed"
    assert last_update.kwargs["result"]["meta"]["text"] == "Transcribed Text"
    assert last_update.kwargs["result"]["meta"]["transcript"] == "Transcribed Text"

@pytest.mark.asyncio
async def test_pipeline_transcribe_step_forwards_cli_engine():
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, asr=asr)

    asr.transcribe.return_value = TaskResult(
        success=True,
        artifacts=[_artifact("subtitle", "/tmp/video.srt")],
        meta={"text": "Transcribed Text", "segments": []},
    )

    steps = [
        PipelineStepRequest(
            step_name="transcribe",
            params=TranscribeParams(
                audio_ref={"path": "/tmp/video.mp4", "name": "video.mp4"},
                engine="cli",
                model="large-v2",
                device="cuda",
            ),
        )
    ]

    result = await runner.run(steps, task_id="task-cli-123")

    assert result["status"] == "completed"
    asr.transcribe.assert_called_once()
    call_args = asr.transcribe.call_args
    assert call_args.kwargs["audio_path"] == "/tmp/video.mp4"
    assert call_args.kwargs["engine"] == "cli"
    assert call_args.kwargs["model_name"] == "large-v2"
    assert call_args.kwargs["device"] == "cuda"

    last_update = mock_tm.update_task.call_args_list[-1]
    assert last_update.kwargs["status"] == "completed"
    assert last_update.kwargs["result"]["meta"]["text"] == "Transcribed Text"
    assert last_update.kwargs["result"]["meta"]["transcript"] == "Transcribed Text"

@pytest.mark.asyncio
async def test_pipeline_orchestration_with_audio_download():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, downloader=downloader, asr=asr)

    downloader.download = AsyncMock(
        return_value=TaskResult(
            success=True,
            artifacts=[_artifact("audio", "/tmp/audio.m4a")],
            meta={"filename": "audio.m4a", "title": "Test Audio"},
        )
    )
    asr.transcribe.return_value = TaskResult(
        success=True,
        artifacts=[_artifact("subtitle", "/tmp/audio.srt")],
        meta={"text": "Transcribed Audio", "segments": []},
    )

    steps = [
        PipelineStepRequest(
            step_name="download",
            params=DownloadParams(url="http://example.com/audio", resolution="audio"),
        ),
        PipelineStepRequest(step_name="transcribe", params=TranscribeParams(model="tiny")),
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
    result_artifacts = last_update.kwargs["result"]["artifacts"]
    assert any(artifact["kind"] == "audio" for artifact in result_artifacts)

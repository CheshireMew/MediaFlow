import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.core.pipeline import PipelineRunner
from backend.models.pipeline_contracts import DownloadParams, PipelineStepRequest, TranscribeParams, TranslateParams
from backend.models.media_contracts import MediaReference, TaskArtifact, TaskResult
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.task_result_contracts import (
    DownloadOutput,
    PipelineOutputs,
    TranscriptionOutput,
)
from backend.application.pipeline_steps.download import DownloadStep
from backend.application.pipeline_steps.registry import StepRegistry
from backend.application.pipeline_steps.transcribe import TranscribeStep
from backend.application.pipeline_steps.translate import TranslateStep


def _pipeline_runner(*, task_manager, downloader=None, asr=None, translator=None):
    steps = []
    if downloader is not None:
        steps.append(DownloadStep(downloader=downloader, task_manager=task_manager))
    if asr is not None:
        steps.append(TranscribeStep(asr_service=asr, task_manager=task_manager))
    if translator is not None:
        steps.append(TranslateStep(translator=translator, task_manager=task_manager))
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


def _download_result(kind: str, path: str, *, title: str) -> TaskResult:
    filename = path.rsplit("/", 1)[-1]
    return TaskResult(
        success=True,
        artifacts=[_artifact(kind, path)],
        outputs=PipelineOutputs(
            download=DownloadOutput(
                id="download-test",
                title=title,
                duration=1,
                filename=filename,
                source_url="http://example.com/media",
            )
        ),
    )


def _transcription_result(path: str, text: str) -> TaskResult:
    return TaskResult(
        success=True,
        artifacts=[_artifact("subtitle", path)],
        outputs=PipelineOutputs(
            transcription=TranscriptionOutput(
                task_id="transcribe-test",
                language="en",
                duration=1,
                segments=[],
                text=text,
            )
        ),
    )

@pytest.mark.asyncio
async def test_pipeline_orchestration_flow():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, downloader=downloader, asr=asr)

    downloader.download = AsyncMock(
        return_value=_download_result("video", "/tmp/video.mp4", title="Test Video")
    )
    asr.transcribe.return_value = _transcription_result(
        "/tmp/video.srt", "Transcribed Text"
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
    assert (
        last_update.kwargs["result"]["outputs"]["transcription"]["text"]
        == "Transcribed Text"
    )

@pytest.mark.asyncio
async def test_pipeline_transcribe_step_forwards_cli_engine():
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, asr=asr)

    asr.transcribe.return_value = _transcription_result(
        "/tmp/video.srt", "Transcribed Text"
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
    assert (
        last_update.kwargs["result"]["outputs"]["transcription"]["text"]
        == "Transcribed Text"
    )

@pytest.mark.asyncio
async def test_pipeline_orchestration_with_audio_download():
    downloader = MagicMock()
    asr = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, downloader=downloader, asr=asr)

    downloader.download = AsyncMock(
        return_value=_download_result("audio", "/tmp/audio.m4a", title="Test Audio")
    )
    asr.transcribe.return_value = _transcription_result(
        "/tmp/audio.srt", "Transcribed Audio"
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
    assert (
        last_update.kwargs["result"]["outputs"]["transcription"]["text"]
        == "Transcribed Audio"
    )
    result_artifacts = last_update.kwargs["result"]["artifacts"]
    assert any(artifact["kind"] == "audio" for artifact in result_artifacts)


@pytest.mark.asyncio
async def test_translation_pipeline_publishes_translated_segments_contract(tmp_path):
    translator = MagicMock()
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    runner = _pipeline_runner(task_manager=mock_tm, translator=translator)
    source_path = tmp_path / "source.srt"
    source_path.write_text("", encoding="utf-8")
    translator.translate_segments.return_value = [
        SubtitleSegment(id="1", start=0, end=1, text="你好"),
    ]

    steps = [
        PipelineStepRequest(
            step_name="translate",
            params=TranslateParams(
                segments=[SubtitleSegment(id="1", start=0, end=1, text="hello")],
                target_language="SimplifiedChinese",
                mode="standard",
                context_ref=MediaReference(path=str(source_path), name=source_path.name),
            ),
        ),
    ]

    result = await runner.run(steps, task_id="task-translate-123")

    assert result["status"] == "completed"
    last_update = mock_tm.update_task.call_args_list[-1]
    result_payload = last_update.kwargs["result"]
    assert result_payload["outputs"]["translation"]["segments"] == [
        {"id": "1", "start": 0.0, "end": 1.0, "text": "你好"},
    ]
    assert result_payload["outputs"]["translation"]["language"] == "SimplifiedChinese"
    assert result_payload["outputs"]["translation"]["mode"] == "standard"
    assert result_payload["artifacts"][0]["kind"] == "subtitle"

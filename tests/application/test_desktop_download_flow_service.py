from pathlib import Path

import pytest

from backend.application.desktop_download_flow_service import (
    DesktopDownloadFlowRequest,
    DesktopDownloadFlowService,
)
from backend.models.schemas import FileRef, TaskResult


class FakeDownloader:
    async def download(self, **kwargs):
        return TaskResult(
            success=True,
            files=[FileRef(type="video", path="C:/tmp/video.mp4", label="source")],
            meta={"title": "demo"},
        )


class FakeASR:
    def __init__(self):
        self.calls = []

    def transcribe(self, **kwargs):
        self.calls.append(kwargs)
        return TaskResult(
            success=True,
            files=[FileRef(type="subtitle", path="C:/tmp/video.srt", label="source_subtitle")],
            meta={
                "text": "hello world",
                "language": "en",
                "segments": [
                    {"id": "1", "start": 0.0, "end": 1.0, "text": "hello"},
                ],
            },
        )


class FakeTranslator:
    def __init__(self):
        self.calls = []

    def translate_segments(self, **kwargs):
        self.calls.append(kwargs)
        segment = kwargs["segments"][0].model_copy()
        segment.text = "你好"
        return [segment]


class FakeSynthesis:
    def __init__(self):
        self.calls = []

    def synthesize(self, **kwargs):
        self.calls.append(kwargs)
        return "C:/tmp/video_synthesized.mp4"


@pytest.mark.asyncio
async def test_execute_auto_flow_merges_transcribe_translate_and_synthesis_outputs(monkeypatch):
    saved_paths: list[str] = []

    def fake_save_srt(segments, output_path):
        saved_paths.append(output_path)
        return f"{output_path}.srt"

    monkeypatch.setattr(
        "backend.utils.subtitle_manager.SubtitleManager.save_srt",
        fake_save_srt,
    )

    progress_events: list[tuple[float, str]] = []
    asr = FakeASR()
    translator = FakeTranslator()
    synthesis = FakeSynthesis()
    service = DesktopDownloadFlowService(
        downloader=FakeDownloader(),
        asr_service=asr,
        translator=translator,
        synthesis=synthesis,
    )
    request = DesktopDownloadFlowRequest(
        url="https://example.com/video",
        auto_execute_flow=True,
        target_language="Chinese",
        translation_mode="intelligent",
        transcription_engine="cli",
        transcription_model="large-v3",
        device="cuda",
        synthesis_options={"target_resolution": "1080p", "subtitle_position_y": 0.85},
        watermark_path="C:/tmp/latest.png",
    )

    result = await service.execute(
        request,
        progress_callback=lambda progress, message: progress_events.append((float(progress), message)),
    )
    file_paths = {Path(file_ref.path) for file_ref in result.files}
    translated_path = Path("C:/tmp/video_CN.srt")
    synthesized_path = Path("C:/tmp/video_synthesized.mp4")

    assert result.success is True
    assert Path("C:/tmp/video.srt") in file_paths
    assert translated_path in file_paths
    assert synthesized_path in file_paths
    assert result.meta["transcript"] == "hello world"
    assert result.meta["transcription_language"] == "en"
    assert Path(result.meta["translated_subtitle_path"]) == translated_path
    assert result.meta["subtitle_ref"]["path"] == str(translated_path)
    assert result.meta["subtitle_ref"]["media_kind"] == "subtitle"
    assert Path(result.meta["video_path"]) == synthesized_path
    assert Path(result.meta["video_ref"]["path"]) == synthesized_path
    assert result.meta["video_ref"]["media_kind"] == "video"
    assert Path(result.meta["output_ref"]["path"]) == synthesized_path
    assert saved_paths == [str(Path("C:/tmp/video.srt").with_name("video_CN"))]
    assert progress_events[-1] == (100.0, "Download flow completed")
    assert asr.calls[0]["engine"] == "cli"
    assert asr.calls[0]["model_name"] == "large-v3"
    assert asr.calls[0]["device"] == "cuda"
    assert translator.calls[0]["mode"] == "intelligent"
    assert synthesis.calls[0]["watermark_path"] == "C:/tmp/latest.png"
    assert synthesis.calls[0]["options"] == {
        "target_resolution": "1080p",
        "subtitle_position_y": 0.85,
    }

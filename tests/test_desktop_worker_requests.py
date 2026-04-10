from pathlib import Path
from types import SimpleNamespace

from backend.desktop.commands.editor_commands import handle_transcribe_segment
from backend.desktop.commands.media_commands import (
    handle_synthesize,
    handle_transcribe,
    handle_translate,
)
from backend.desktop.commands.ocr_commands import handle_extract


def test_handle_transcribe_normalizes_audio_ref_into_audio_path(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    def fake_execute_transcription(request, *, progress_callback=None, task_id=None):
        calls["request"] = request
        calls["task_id"] = task_id
        return {
            "segments": [],
            "text": "ok",
            "language": "en",
            "video_ref": request.audio_ref,
            "subtitle_ref": {"path": "E:/out/demo.srt", "name": "demo.srt"},
            "output_ref": {"path": "E:/out/demo.srt", "name": "demo.srt"},
        }

    monkeypatch.setattr(
        "backend.application.transcription_service.execute_transcription",
        fake_execute_transcription,
    )
    monkeypatch.setattr("backend.desktop.commands.media_commands.emit", emitted.append)

    handle_transcribe(
        "req-1",
        {
            "audio_ref": {
                "path": "E:/media/demo.mp4",
                "name": "demo.mp4",
            },
            "model": "base",
            "device": "cpu",
        },
    )

    assert calls["request"].audio_path == "E:/media/demo.mp4"
    assert calls["task_id"] == "desktop-req-1"
    assert emitted[-1]["result"]["video_ref"].path == "E:/media/demo.mp4"


def test_handle_translate_normalizes_context_ref_into_context_path(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    def fake_execute_translation(request, *, progress_callback=None):
        calls["request"] = request
        return {
            "segments": [],
            "language": request.target_language,
            "context_ref": request.context_ref,
            "subtitle_ref": {"path": "E:/out/demo_CN.srt", "name": "demo_CN.srt"},
            "output_ref": {"path": "E:/out/demo_CN.srt", "name": "demo_CN.srt"},
            "mode": request.mode,
        }

    monkeypatch.setattr(
        "backend.application.translation_service.execute_translation",
        fake_execute_translation,
    )
    monkeypatch.setattr("backend.desktop.commands.media_commands.emit", emitted.append)

    handle_translate(
        "req-2",
        {
            "segments": [],
            "target_language": "Chinese",
            "mode": "standard",
            "context_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
            },
        },
    )

    assert calls["request"].context_path == "E:/subs/demo.srt"
    assert calls["request"].context_ref.path == "E:/subs/demo.srt"
    assert emitted[-1]["result"]["context_ref"].path == "E:/subs/demo.srt"


def test_handle_synthesize_normalizes_ref_only_payload(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    def fake_execute_synthesis(request, *, progress_callback=None):
        calls["request"] = request
        return {
            "video_path": "E:/out/demo_burned.mp4",
            "output_path": "E:/out/demo_burned.mp4",
            "video_ref": {"path": "E:/out/demo_burned.mp4", "name": "demo_burned.mp4"},
            "output_ref": {"path": "E:/out/demo_burned.mp4", "name": "demo_burned.mp4"},
            "context_ref": request.srt_ref,
            "subtitle_ref": request.srt_ref,
        }

    monkeypatch.setattr(
        "backend.application.synthesis_service.execute_synthesis",
        fake_execute_synthesis,
    )
    monkeypatch.setattr("backend.desktop.commands.media_commands.emit", emitted.append)

    handle_synthesize(
        "req-3",
        {
            "video_ref": {
                "path": "E:/media/demo.mp4",
                "name": "demo.mp4",
            },
            "srt_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
            },
            "options": {},
        },
    )

    assert calls["request"].video_path == "E:/media/demo.mp4"
    assert calls["request"].srt_path == "E:/subs/demo.srt"
    assert emitted[-1]["result"]["context_ref"].path == "E:/subs/demo.srt"


def test_handle_extract_normalizes_video_ref_into_video_path(monkeypatch, tmp_path):
    source_path = tmp_path / "clip.mp4"
    source_path.write_text("video", encoding="utf-8")
    emitted: list[dict] = []
    calls: dict[str, object] = {}

    def fake_execute_ocr(request, *, progress_callback):
        calls["request"] = request
        return {
            "events": [{"start": 0.0, "end": 1.0, "text": "hello", "box": []}],
            "files": [
                {"type": "json", "path": f"{source_path.with_suffix('')}.ocr.json"},
                {"type": "srt", "path": f"{source_path.with_suffix('')}.ocr.srt"},
            ],
        }

    monkeypatch.setattr(
        "backend.application.ocr_service.execute_ocr",
        fake_execute_ocr,
    )
    monkeypatch.setattr("backend.desktop.commands.ocr_commands.emit", emitted.append)

    handle_extract(
        "req-4",
        {
            "video_ref": {
                "path": str(source_path),
                "name": source_path.name,
            },
            "engine": "rapid",
            "sample_rate": 3,
        },
    )

    assert calls["request"].video_path == str(source_path)
    assert calls["request"].sample_rate == 3
    assert emitted[-1]["result"]["files"][1]["path"].endswith(".ocr.srt")


def test_handle_transcribe_segment_normalizes_audio_ref_into_audio_path(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    class FakeASRService:
        def transcribe_segment(self, **kwargs):
            calls["kwargs"] = kwargs
            return SimpleNamespace(
                success=True,
                error=None,
                meta={"text": "ok", "segments": []},
            )

    monkeypatch.setattr(
        "backend.core.runtime_access.RuntimeServices.asr",
        staticmethod(lambda: FakeASRService()),
    )
    monkeypatch.setattr("backend.desktop.commands.editor_commands.emit", emitted.append)

    handle_transcribe_segment(
        "req-5",
        {
            "audio_ref": {
                "path": "E:/media/demo.mp4",
                "name": "demo.mp4",
            },
            "start": 0,
            "end": 5,
            "model": "base",
            "device": "cpu",
        },
    )

    assert calls["kwargs"]["audio_path"] == "E:/media/demo.mp4"
    assert emitted[-1]["result"]["status"] == "completed"

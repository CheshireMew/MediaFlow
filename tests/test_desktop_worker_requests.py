from pathlib import Path
from types import SimpleNamespace

from backend.desktop_worker import (
    handle_extract,
    handle_synthesize,
    handle_transcribe,
    handle_transcribe_segment,
    handle_translate,
)


def test_handle_transcribe_normalizes_audio_ref_into_audio_path(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    class FakeASRService:
        def transcribe(self, **kwargs):
            calls["kwargs"] = kwargs
            return SimpleNamespace(
                success=True,
                error=None,
                meta={
                    "segments": [],
                    "text": "ok",
                    "language": "en",
                    "subtitle_ref": {"path": "E:/out/demo.srt", "name": "demo.srt"},
                    "output_ref": {"path": "E:/out/demo.srt", "name": "demo.srt"},
                },
            )

    monkeypatch.setattr("backend.services.asr.ASRService", FakeASRService)
    monkeypatch.setattr("backend.desktop_worker.emit", emitted.append)

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

    assert calls["kwargs"]["audio_path"] == "E:/media/demo.mp4"
    assert emitted[-1]["result"]["video_ref"].path == "E:/media/demo.mp4"


def test_handle_translate_normalizes_context_ref_into_context_path(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    class FakeTranslator:
        def translate_segments(self, **kwargs):
            calls["translate_kwargs"] = kwargs
            return kwargs["segments"]

    def fake_build_translation_task_result(
        segments,
        *,
        target_language,
        mode,
        context_path=None,
        context_ref=None,
    ):
        calls["build_kwargs"] = {
            "segments": segments,
            "target_language": target_language,
            "mode": mode,
            "context_path": context_path,
            "context_ref": context_ref,
        }
        return SimpleNamespace(
            meta={
                "segments": [],
                "context_ref": context_ref,
                "subtitle_ref": {"path": "E:/out/demo_CN.srt", "name": "demo_CN.srt"},
                "output_ref": {"path": "E:/out/demo_CN.srt", "name": "demo_CN.srt"},
            }
        )

    monkeypatch.setattr(
        "backend.services.translator.llm_translator.LLMTranslator",
        FakeTranslator,
    )
    monkeypatch.setattr(
        "backend.application.translation_service.build_translation_task_result",
        fake_build_translation_task_result,
    )
    monkeypatch.setattr("backend.desktop_worker.emit", emitted.append)

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

    assert calls["build_kwargs"]["context_path"] == "E:/subs/demo.srt"
    assert calls["build_kwargs"]["context_ref"].path == "E:/subs/demo.srt"
    assert emitted[-1]["result"]["context_ref"].path == "E:/subs/demo.srt"


def test_handle_synthesize_normalizes_ref_only_payload(monkeypatch):
    calls: dict[str, object] = {}
    emitted: list[dict] = []

    class FakeVideoSynthesizer:
        def burn_in_subtitles(self, **kwargs):
            calls["kwargs"] = kwargs
            return "E:/out/demo_burned.mp4"

    monkeypatch.setattr("backend.services.video_synthesizer.VideoSynthesizer", FakeVideoSynthesizer)
    monkeypatch.setattr("backend.desktop_worker.emit", emitted.append)

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

    assert calls["kwargs"]["video_path"] == "E:/media/demo.mp4"
    assert calls["kwargs"]["srt_path"] == "E:/subs/demo.srt"
    assert emitted[-1]["result"]["context_ref"].path == "E:/subs/demo.srt"


def test_handle_extract_normalizes_video_ref_into_video_path(monkeypatch, tmp_path):
    source_path = tmp_path / "clip.mp4"
    source_path.write_text("video", encoding="utf-8")
    emitted: list[dict] = []
    calls: dict[str, object] = {}

    class FakeEvent:
        def __init__(self):
            self.start = 0.0
            self.end = 1.0
            self.text = "hello"

        def model_dump(self, mode=None):
            return {"start": self.start, "end": self.end, "text": self.text, "box": []}

    class FakeEngine:
        ocr = None

        def initialize_models(self, callback):
            callback(0.5, "init")

    class FakePipeline:
        def __init__(self, engine):
            calls["engine"] = engine

        def process_video(self, **kwargs):
            calls["kwargs"] = kwargs
            return [FakeEvent()]

    monkeypatch.setattr("backend.desktop_worker.get_ocr_engine", lambda engine_type="rapid": FakeEngine())
    monkeypatch.setattr("backend.services.ocr.pipeline.VideoOCRPipeline", FakePipeline)
    monkeypatch.setattr("backend.desktop_worker.emit", emitted.append)

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

    assert calls["kwargs"]["video_path"] == str(source_path)
    assert calls["kwargs"]["sample_rate"] == 3
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

    monkeypatch.setattr("backend.services.asr.ASRService", FakeASRService)
    monkeypatch.setattr("backend.desktop_worker.emit", emitted.append)

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

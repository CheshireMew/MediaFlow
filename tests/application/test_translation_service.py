from pathlib import Path

from backend.application.translation_service import build_translation_task_result
from backend.models.schemas import MediaReference, SubtitleSegment


def test_build_translation_task_result_emits_output_artifact(monkeypatch):
    saved_path = Path("C:/tmp/demo_ZH-CN.srt")

    monkeypatch.setattr(
        "backend.utils.subtitle_writer.SubtitleWriter.save_srt",
        lambda segments, output_path: str(saved_path),
    )

    result = build_translation_task_result(
        [
            SubtitleSegment(id="1", start=0.0, end=1.0, text="你好"),
        ],
        target_language="SimplifiedChinese",
        mode="standard",
        context_ref=MediaReference(
            path="C:/tmp/demo.srt",
            name="demo.srt",
            type="application/x-subrip",
            media_kind="subtitle",
            role="context",
        ),
    )

    assert result.meta["language"] == "SimplifiedChinese"
    assert not any(key.endswith("_ref") for key in result.meta)
    assert result.artifacts[0].kind == "subtitle"
    assert result.artifacts[0].ref.path == str(saved_path)
    assert result.artifacts[0].ref.role == "output"


def test_build_translation_task_result_prefers_normalized_context_ref(monkeypatch):
    saved_path = Path("C:/tmp/demo_ZH-CN.srt")
    captured = {}

    def fake_save_srt(_segments, output_path):
        captured["output_path"] = output_path
        return str(saved_path)

    monkeypatch.setattr("backend.utils.subtitle_writer.SubtitleWriter.save_srt", fake_save_srt)

    result = build_translation_task_result(
        [
            SubtitleSegment(id="1", start=0.0, end=1.0, text="你好"),
        ],
        target_language="SimplifiedChinese",
        mode="standard",
        context_ref=MediaReference(
            path="C:/canonical/demo.srt",
            name="demo.srt",
            type="application/x-subrip",
            media_kind="subtitle",
            role="context",
            origin="request",
        ),
    )

    assert captured["output_path"] == "C:\\canonical\\demo_ZH-CN.srt"
    assert result.artifacts[0].ref.path == str(saved_path)


def test_build_translation_task_result_uses_shortened_output_path_for_long_context(monkeypatch):
    captured = {}

    def fake_save_srt(segments, output_path):
        captured["output_path"] = output_path
        return output_path

    monkeypatch.setattr(
        "backend.utils.subtitle_writer.SubtitleWriter.save_srt",
        fake_save_srt,
    )

    result = build_translation_task_result(
        [
            SubtitleSegment(id="1", start=0.0, end=1.0, text="你好"),
        ],
        target_language="SimplifiedChinese",
        mode="standard",
        context_ref=MediaReference(
            path=(
                "C:/Users/Lenovo/Downloads/"
                "Cannibal Stocks (@cannibalstocks)- 'Mohnish Pabrai just revealed that Charlie Munger was buying "
                "Alpha Metallurgical Resources literally days before he passed away. Still making long-term bets "
                "at 99.9 years old. $AMR traded ar.ts.srt"
            ),
            name="source.srt",
            type="application/x-subrip",
            media_kind="subtitle",
            role="context",
        ),
    )

    assert len(captured["output_path"]) <= 240
    assert captured["output_path"].endswith("_ZH-CN.srt")
    assert result.artifacts[0].ref.path == captured["output_path"]

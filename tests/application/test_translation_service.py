from pathlib import Path

from backend.application.translation_service import build_translation_task_result
from backend.models.schemas import MediaReference, SubtitleSegment


def test_build_translation_task_result_emits_structured_media_refs(monkeypatch):
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

    assert result.meta["context_ref"]["path"] == "C:/tmp/demo.srt"
    assert result.meta["context_ref"]["media_kind"] == "subtitle"
    assert result.meta["subtitle_ref"]["path"] == str(saved_path)
    assert result.meta["output_ref"]["path"] == str(saved_path)
    assert result.meta["output_ref"]["role"] == "output"


def test_build_translation_task_result_prefers_normalized_context_ref(monkeypatch):
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
            path="C:/canonical/demo.srt",
            name="demo.srt",
            type="application/x-subrip",
            media_kind="subtitle",
            role="context",
            origin="request",
        ),
    )

    assert result.meta["context_ref"]["path"] == "C:/canonical/demo.srt"
    assert result.meta["context_ref"]["origin"] == "request"

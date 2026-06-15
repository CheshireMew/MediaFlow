from pathlib import Path

from backend.application import clip_export_service
from backend.models.schemas import ClipExportSegment, MediaReference


class _FakeSynthesis:
    def __init__(self):
        self.calls = []

    def synthesize(self, **kwargs):
        self.calls.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"rendered")
        if kwargs.get("progress_callback"):
            kwargs["progress_callback"](100, "done")
        return kwargs["output_path"]


def _media_ref(path: Path, media_type: str = "video/mp4") -> MediaReference:
    return MediaReference(path=str(path), name=path.name, type=media_type)


def test_export_clips_burned_uses_synthesis_timeline(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    srt_path = tmp_path / "demo.srt"
    watermark_path = tmp_path / "watermark.png"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    srt_path.write_text("1\n00:00:01,000 --> 00:00:02,000\nHi\n", encoding="utf-8")
    watermark_path.write_bytes(b"png")
    fake_synthesis = _FakeSynthesis()
    monkeypatch.setattr(
        clip_export_service,
        "runtime_service",
        lambda _service: fake_synthesis,
    )

    files = clip_export_service.export_clips(
        video_ref=_media_ref(video_path),
        segments=[ClipExportSegment(id="clip-1", start=12.2, end=30.0, title="核心反转")],
        render_mode="burned",
        srt_ref=_media_ref(srt_path, "application/x-subrip"),
        watermark_path=str(watermark_path),
        options={"font_size": 30, "wm_opacity": 0.8},
        output_dir=str(output_dir),
    )

    assert len(files) == 1
    assert files[0].path.endswith("_rendered_核心反转.mp4")
    assert len(fake_synthesis.calls) == 1
    call = fake_synthesis.calls[0]
    assert call["video_path"] == str(video_path)
    assert call["srt_path"] == str(srt_path)
    assert call["watermark_path"] == str(watermark_path)
    assert call["options"]["trim_start"] == 12.2
    assert call["options"]["trim_end"] == 30.0
    assert call["options"]["disable_auto_trim"] is True
    assert call["options"]["font_size"] == 30


def test_export_clips_source_uses_copy_without_subtitles(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    calls = []

    def fake_copy(source_path, output_path, start, end):
        calls.append((source_path, output_path, start, end))
        Path(output_path).write_bytes(b"source")

    monkeypatch.setattr(clip_export_service, "_run_ffmpeg_copy_clip", fake_copy)

    files = clip_export_service.export_clips(
        video_ref=_media_ref(video_path),
        segments=[ClipExportSegment(id="clip-1", start=1.0, end=2.5, title="raw")],
        render_mode="source",
        srt_ref=None,
        watermark_path=None,
        options=None,
        output_dir=str(output_dir),
    )

    assert len(files) == 1
    assert files[0].path.endswith("_source_raw.mp4")
    assert calls == [(str(video_path), files[0].path, 1.0, 2.5)]

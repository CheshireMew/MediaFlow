import subprocess
import threading
import time
from pathlib import Path

import ffmpeg
import pytest
from pydantic import ValidationError

from backend.application import clip_export_service
from backend.config import settings
from backend.models.editor_contracts import ClipExportSegment
from backend.models.media_contracts import MediaReference
from backend.services.video.encoder_config import EncoderConfigResolver
from backend.services.video.ffmpeg_runner import FfmpegRunner
from backend.services.video.filter_graph_builder import FilterGraphBuilder
from backend.services.video.media_prober import MediaInfo
from backend.services.video.synthesis import SynthesisOrchestrator


class _FakeSynthesis:
    def __init__(self):
        self.calls = []

    def synthesize(self, **kwargs):
        self.calls.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"rendered")
        if kwargs.get("progress_callback"):
            kwargs["progress_callback"](
                100,
                "synthesis_encoding",
                {"percent": 100, "speed": "1.0x"},
            )
        return kwargs["output_path"]


def _media_ref(path: Path, media_type: str = "video/mp4") -> MediaReference:
    return MediaReference(path=str(path), name=path.name, type=media_type)


def _mock_source_probe(monkeypatch, duration: float) -> None:
    monkeypatch.setattr(
        clip_export_service.MediaProber,
        "probe_media",
        lambda _path: MediaInfo(
            duration=duration,
            width=1920,
            height=1080,
            has_audio=True,
        ),
    )


def test_export_clips_burned_uses_synthesis_timeline(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    srt_path = tmp_path / "demo.srt"
    watermark_path = tmp_path / "watermark.png"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    srt_path.write_text("1\n00:00:01,000 --> 00:00:02,000\nHi\n", encoding="utf-8")
    watermark_path.write_bytes(b"png")
    fake_synthesis = _FakeSynthesis()
    progress_events = []
    _mock_source_probe(monkeypatch, 60.0)
    monkeypatch.setattr(
        clip_export_service.MediaProber,
        "get_duration",
        lambda path: 60.0 if Path(path) == video_path else 17.8,
    )
    files = clip_export_service.export_clips(
        video_synthesis=fake_synthesis,
        video_ref=_media_ref(video_path),
        segments=[ClipExportSegment(id="clip-1", start=12.2, end=30.0, title="核心反转")],
        render_mode="burned",
        srt_ref=_media_ref(srt_path, "application/x-subrip"),
        watermark_ref=_media_ref(watermark_path, "image/png"),
        options={"font_size": 30, "wm_opacity": 0.8},
        output_dir=str(output_dir),
        progress_callback=lambda progress, code, params: progress_events.append(
            (progress, code, params)
        ),
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
    assert progress_events == [
        (0.0, "clip_exporting", {"current": 1, "total": 1}),
        (90.0, "synthesis_encoding", {"percent": 100, "speed": "1.0x"}),
        (100, "clip_export_completed", {}),
    ]


def test_export_clips_source_uses_exact_render_without_subtitles_or_watermark(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    fake_synthesis = _FakeSynthesis()
    _mock_source_probe(monkeypatch, 10.0)
    monkeypatch.setattr(
        clip_export_service.MediaProber,
        "get_duration",
        lambda path: 10.0 if Path(path) == video_path else 1.5,
    )

    files = clip_export_service.export_clips(
        video_synthesis=fake_synthesis,
        video_ref=_media_ref(video_path),
        segments=[ClipExportSegment(id="clip-1", start=1.0, end=2.5, title="raw")],
        render_mode="source",
        srt_ref=None,
        watermark_ref=None,
        options=None,
        output_dir=str(output_dir),
    )

    assert len(files) == 1
    assert files[0].path.endswith("_source_raw.mp4")
    assert len(fake_synthesis.calls) == 1
    call = fake_synthesis.calls[0]
    assert call["video_path"] == str(video_path)
    assert call["srt_path"] is None
    assert call["watermark_path"] is None
    assert call["options"]["skip_subtitles"] is True
    assert call["options"]["preserve_frame_rate"] is True
    assert call["options"]["trim_start"] == 1.0
    assert call["options"]["trim_end"] == 2.5


def test_source_export_uses_stream_copy_without_starting_encoder(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    synthesis = _FakeSynthesis()
    _mock_source_probe(monkeypatch, 10.0)

    def stream_copy(_source_path, output_path, _segment):
        Path(output_path).write_bytes(b"copied")
        return True

    monkeypatch.setattr(clip_export_service, "_try_stream_copy", stream_copy)
    monkeypatch.setattr(clip_export_service.MediaProber, "get_duration", lambda _path: 1.0)

    files = clip_export_service.export_clips(
        video_synthesis=synthesis,
        video_ref=_media_ref(video_path),
        segments=[ClipExportSegment(id="clip-1", start=2.0, end=3.0)],
        render_mode="source",
        srt_ref=None,
        watermark_ref=None,
        options=None,
        output_dir=str(tmp_path / "clips"),
    )

    assert Path(files[0].path).read_bytes() == b"copied"
    assert synthesis.calls == []


def test_source_stream_copy_runs_in_parallel_and_preserves_requested_order(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    _mock_source_probe(monkeypatch, 10.0)
    lock = threading.Lock()
    active = 0
    peak_active = 0

    def stream_copy(_source_path, output_path, segment):
        nonlocal active, peak_active
        with lock:
            active += 1
            peak_active = max(peak_active, active)
        time.sleep(0.03 * (5 - int(segment.id.rsplit("-", 1)[1])))
        Path(output_path).write_bytes(segment.id.encode("utf-8"))
        with lock:
            active -= 1
        return True

    monkeypatch.setattr(clip_export_service, "_try_stream_copy", stream_copy)
    monkeypatch.setattr(clip_export_service.MediaProber, "get_duration", lambda _path: 1.0)
    segments = [
        ClipExportSegment(id=f"clip-{index}", start=float(index), end=float(index + 1))
        for index in range(1, 5)
    ]

    files = clip_export_service.export_clips(
        video_synthesis=_FakeSynthesis(),
        video_ref=_media_ref(video_path),
        segments=segments,
        render_mode="source",
        srt_ref=None,
        watermark_ref=None,
        options=None,
        output_dir=str(tmp_path / "clips"),
    )

    assert peak_active >= 2
    assert [Path(file.path).read_bytes().decode("utf-8") for file in files] == [
        segment.id for segment in segments
    ]


@pytest.mark.parametrize(
    ("start", "end"),
    [(-1.0, 1.0), (1.0, 1.0), (2.0, 1.0), (float("nan"), 1.0), (0.0, float("inf"))],
)
def test_clip_export_segment_rejects_invalid_time_ranges(start, end):
    with pytest.raises(ValidationError):
        ClipExportSegment(id="invalid", start=start, end=end)


def test_export_clips_rejects_range_beyond_media_before_creating_output(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    _mock_source_probe(monkeypatch, 2.0)
    monkeypatch.setattr(clip_export_service.MediaProber, "get_duration", lambda _path: 2.0)

    with pytest.raises(ValueError, match="exceeds video duration"):
        clip_export_service.export_clips(
            video_synthesis=_FakeSynthesis(),
            video_ref=_media_ref(video_path),
            segments=[ClipExportSegment(id="clip-1", start=1.0, end=3.0)],
            render_mode="source",
            srt_ref=None,
            watermark_ref=None,
            options=None,
            output_dir=str(output_dir),
        )

    assert not output_dir.exists()


def test_export_clips_publishes_batch_only_after_every_clip_succeeds(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")

    class _FailsSecondSynthesis:
        def __init__(self):
            self.call_count = 0

        def synthesize(self, **kwargs):
            self.call_count += 1
            if self.call_count == 2:
                raise RuntimeError("second clip failed")
            Path(kwargs["output_path"]).write_bytes(b"rendered")

    synthesis = _FailsSecondSynthesis()
    _mock_source_probe(monkeypatch, 10.0)
    monkeypatch.setattr(
        clip_export_service.MediaProber,
        "get_duration",
        lambda path: 10.0 if Path(path) == video_path else 1.0,
    )

    with pytest.raises(RuntimeError, match="second clip failed"):
        clip_export_service.export_clips(
            video_synthesis=synthesis,
            video_ref=_media_ref(video_path),
            segments=[
                ClipExportSegment(id="clip-1", start=1.0, end=2.0),
                ClipExportSegment(id="clip-2", start=3.0, end=4.0),
            ],
            render_mode="source",
            srt_ref=None,
            watermark_ref=None,
            options=None,
            output_dir=str(output_dir),
        )

    assert output_dir.exists()
    assert list(output_dir.iterdir()) == []


def test_export_clips_probes_source_once_for_entire_batch(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    probe_calls: list[str] = []

    def probe(path: str) -> MediaInfo:
        probe_calls.append(path)
        return MediaInfo(duration=10.0, width=1280, height=720, has_audio=True)

    monkeypatch.setattr(clip_export_service.MediaProber, "probe_media", probe)
    monkeypatch.setattr(clip_export_service.MediaProber, "get_duration", lambda _path: 1.0)
    synthesis = _FakeSynthesis()

    clip_export_service.export_clips(
        video_synthesis=synthesis,
        video_ref=_media_ref(video_path),
        segments=[
            ClipExportSegment(id="clip-1", start=1.0, end=2.0),
            ClipExportSegment(id="clip-2", start=3.0, end=4.0),
        ],
        render_mode="source",
        srt_ref=None,
        watermark_ref=None,
        options=None,
        output_dir=str(tmp_path / "clips"),
    )

    assert probe_calls == [str(video_path.resolve())]
    assert all(call["options"]["_source_width"] == 1280 for call in synthesis.calls)


def test_repeated_exports_publish_to_distinct_batch_directories(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    output_dir = tmp_path / "clips"
    video_path.write_bytes(b"video")
    fake_synthesis = _FakeSynthesis()
    _mock_source_probe(monkeypatch, 10.0)
    monkeypatch.setattr(
        clip_export_service.MediaProber,
        "get_duration",
        lambda path: 10.0 if Path(path) == video_path else 1.0,
    )
    export_kwargs = {
        "video_synthesis": fake_synthesis,
        "video_ref": _media_ref(video_path),
        "segments": [ClipExportSegment(id="clip-1", start=1.0, end=2.0)],
        "render_mode": "source",
        "srt_ref": None,
        "watermark_ref": None,
        "options": None,
        "output_dir": str(output_dir),
    }

    first = clip_export_service.export_clips(**export_kwargs)
    second = clip_export_service.export_clips(**export_kwargs)

    assert Path(first[0].path).parent != Path(second[0].path).parent
    assert Path(first[0].path).is_file()
    assert Path(second[0].path).is_file()


def test_source_export_is_exact_and_ignores_incompatible_mkv_attachments(monkeypatch, tmp_path):
    ffmpeg_path = Path(settings.FFMPEG_PATH)
    if not ffmpeg_path.is_file():
        pytest.skip("Bundled FFmpeg is unavailable")

    mp4_path = tmp_path / "long-gop.mp4"
    mkv_path = tmp_path / "long-gop-with-attachment.mkv"
    subprocess.run(
        [
            str(ffmpeg_path),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=60:duration=6",
            "-c:v",
            "libx264",
            "-g",
            "300",
            "-keyint_min",
            "300",
            "-sc_threshold",
            "0",
            "-pix_fmt",
            "yuv420p",
            str(mp4_path),
        ],
        check=True,
    )
    subprocess.run(
        [
            str(ffmpeg_path),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(mp4_path),
            "-map",
            "0:v",
            "-c",
            "copy",
            "-attach",
            str(mp4_path),
            "-metadata:s:t",
            "mimetype=application/octet-stream",
            str(mkv_path),
        ],
        check=True,
    )

    synthesis = SynthesisOrchestrator(
        filter_graph_builder=FilterGraphBuilder(),
        encoder_config_resolver=EncoderConfigResolver(),
        ffmpeg_runner=FfmpegRunner(),
    )
    files = clip_export_service.export_clips(
        video_synthesis=synthesis,
        video_ref=_media_ref(mkv_path, "video/x-matroska"),
        segments=[ClipExportSegment(id="clip-1", start=3.2, end=4.2, title="exact")],
        render_mode="source",
        srt_ref=None,
        watermark_ref=_media_ref(mp4_path),
        options={"use_gpu": False, "preset": "ultrafast"},
        output_dir=str(tmp_path / "clips"),
    )

    probe = ffmpeg.probe(files[0].path, cmd=settings.FFPROBE_PATH)
    assert float(probe["format"]["duration"]) == pytest.approx(1.0, abs=0.15)
    assert {stream["codec_type"] for stream in probe["streams"]} == {"video"}
    assert next(stream for stream in probe["streams"] if stream["codec_type"] == "video")[
        "avg_frame_rate"
    ] == "60/1"

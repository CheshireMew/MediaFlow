import subprocess

import pytest

from backend.config import settings
from backend.models.subtitle_contracts import SubtitleSegment
from backend.services.video.encoder_config import EncoderConfigResolver
from backend.services.video.ffmpeg_runner import FfmpegRunner
from backend.services.video.filter_graph_builder import FilterGraphBuilder
from backend.services.video.media_prober import MediaProber
from backend.services.video.synthesis import SynthesisOrchestrator
from backend.services.video.timeline import resolve_media_export_timeline


def test_synthesis_orchestrator_succeeds_for_video_without_audio(tmp_path):
    video_path = tmp_path / "no_audio.mp4"
    srt_path = tmp_path / "no_audio.srt"
    output_path = tmp_path / "no_audio_synthesized.mp4"

    srt_path.write_text(
        "1\n"
        "00:00:00,000 --> 00:00:01,500\n"
        "Silent clip subtitle\n\n",
        encoding="utf-8",
    )

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=640x360:d=2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )

    synthesis = SynthesisOrchestrator(
        filter_graph_builder=FilterGraphBuilder(),
        encoder_config_resolver=EncoderConfigResolver(),
        ffmpeg_runner=FfmpegRunner(),
    )

    result_path = synthesis.synthesize(
        str(video_path),
        str(srt_path),
        str(output_path),
        options={
            "video_width": 640,
            "video_height": 360,
            "use_gpu": False,
        },
    )

    assert result_path == str(output_path)
    assert output_path.exists()
    assert output_path.stat().st_size > 0


def test_synthesis_orchestrator_succeeds_without_subtitles_when_disabled(tmp_path):
    video_path = tmp_path / "no_subtitles.mp4"
    output_path = tmp_path / "no_subtitles_exported.mp4"

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x180:d=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )

    synthesis = SynthesisOrchestrator(
        filter_graph_builder=FilterGraphBuilder(),
        encoder_config_resolver=EncoderConfigResolver(),
        ffmpeg_runner=FfmpegRunner(),
    )

    result_path = synthesis.synthesize(
        str(video_path),
        None,
        str(output_path),
        options={
            "skip_subtitles": True,
            "disable_auto_trim": True,
            "video_width": 320,
            "video_height": 180,
            "use_gpu": False,
        },
    )

    assert result_path == str(output_path)
    assert output_path.exists()
    assert output_path.stat().st_size > 0


def test_synthesis_orchestrator_uses_whisper_speech_timeline_bounds(tmp_path):
    video_path = tmp_path / "edge_silence.mp4"
    full_output_path = tmp_path / "edge_silence_full.mp4"
    trimmed_output_path = tmp_path / "edge_silence_trimmed.mp4"

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:r=10:d=4",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono:d=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=48000:duration=1",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono:d=2",
            "-filter_complex",
            "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
            "-map",
            "0:v:0",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )

    preview_timeline = resolve_media_export_timeline(
        str(video_path),
        speech_segments=[
            SubtitleSegment(id="speech", start=1.0, end=2.0, text="Speech"),
        ],
        no_speech_trim_enabled=True,
    )
    assert preview_timeline.no_speech_trim_enabled is True
    assert preview_timeline.has_speech_timeline is True
    assert preview_timeline.has_leading_no_speech is True
    assert preview_timeline.has_trailing_no_speech is True
    assert preview_timeline.trim_start == 1.0
    assert preview_timeline.trim_end == 2.0

    synthesis = SynthesisOrchestrator(
        filter_graph_builder=FilterGraphBuilder(),
        encoder_config_resolver=EncoderConfigResolver(),
        ffmpeg_runner=FfmpegRunner(),
    )
    synthesis.synthesize(
        str(video_path),
        None,
        str(full_output_path),
        options={
            "skip_subtitles": True,
            "video_width": 160,
            "video_height": 90,
            "use_gpu": False,
        },
    )
    synthesis.synthesize(
        str(video_path),
        None,
        str(trimmed_output_path),
        options={
            "skip_subtitles": True,
            "trim_start": preview_timeline.trim_start,
            "trim_end": preview_timeline.trim_end,
            "video_width": 160,
            "video_height": 90,
            "use_gpu": False,
        },
    )

    full_duration = MediaProber.get_duration(str(full_output_path))
    trimmed_duration = MediaProber.get_duration(str(trimmed_output_path))
    assert full_duration == pytest.approx(4.0, abs=0.25)
    assert trimmed_duration == pytest.approx(1.0, abs=0.25)
    assert MediaProber.has_audio(str(trimmed_output_path)) is True

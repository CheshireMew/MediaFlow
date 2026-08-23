import subprocess

import pytest

from backend.config import settings
from backend.services.video.media_prober import MediaProber


def test_parse_leading_black_end_accepts_short_black_run_at_origin():
    output = "[Parsed_blackdetect_0] black_start:0 black_end:0.0349609 black_duration:0.0349609"

    assert MediaProber.parse_leading_black_end(output) == 0.0349609


def test_probe_media_resolves_all_synthesis_metadata_with_one_probe(monkeypatch):
    probe_calls: list[tuple[str, str]] = []

    def fake_probe(path: str, *, cmd: str):
        probe_calls.append((path, cmd))
        return {
            "format": {"duration": "12.5"},
            "streams": [
                {
                    "codec_type": "video",
                    "width": 1080,
                    "height": 1920,
                    "tags": {"rotate": "90"},
                },
                {"codec_type": "audio"},
            ],
        }

    monkeypatch.setattr("backend.services.video.media_prober.ffmpeg.probe", fake_probe)

    info = MediaProber.probe_media("source.mp4")

    assert len(probe_calls) == 1
    assert info.duration == 12.5
    assert (info.width, info.height) == (1920, 1080)
    assert info.has_audio is True


def test_parse_leading_black_end_ignores_intentional_long_black_run():
    output = "[Parsed_blackdetect_0] black_start:0 black_end:1.2 black_duration:1.2"

    assert MediaProber.parse_leading_black_end(output) == 0.0


def test_parse_leading_black_end_ignores_later_black_run():
    output = "[Parsed_blackdetect_0] black_start:3.0 black_end:3.1 black_duration:0.1"

    assert MediaProber.parse_leading_black_end(output) == 0.0


def test_parse_trailing_black_start_accepts_only_black_run_reaching_probe_end():
    output = (
        "[Parsed_blackdetect_0] black_start:2 black_end:4 black_duration:2\n"
        "[Parsed_blackdetect_0] black_start:12 black_end:30 black_duration:18"
    )

    assert MediaProber.parse_trailing_black_start(output, probe_duration=30) == 12


def test_parse_trailing_black_start_ignores_internal_black_run():
    output = "[Parsed_blackdetect_0] black_start:12 black_end:20 black_duration:8"

    assert MediaProber.parse_trailing_black_start(output, probe_duration=30) is None


def test_detect_trailing_black_start_expands_until_long_tail_boundary(monkeypatch):
    requested_durations: list[float] = []

    monkeypatch.setattr(MediaProber, "get_duration", lambda _path: 1000.0)

    def fake_probe(_path: str, *, probe_start: float, probe_duration: float) -> str:
        requested_durations.append(probe_duration)
        if probe_duration < 120:
            return (
                "[Parsed_blackdetect_0] black_start:0 "
                f"black_end:{probe_duration} black_duration:{probe_duration}"
            )
        return (
            "[Parsed_blackdetect_0] black_start:20 "
            f"black_end:{probe_duration} black_duration:{probe_duration - 20}"
        )

    monkeypatch.setattr(MediaProber, "_probe_trailing_black_window", fake_probe)

    assert MediaProber.detect_trailing_black_start("long-tail.mp4") == 900.0
    assert requested_durations == [30.0, 60.0, 120.0]


def test_detect_trailing_black_start_does_not_trim_an_entirely_black_video(monkeypatch):
    monkeypatch.setattr(MediaProber, "get_duration", lambda _path: 90.0)

    def fake_probe(_path: str, *, probe_start: float, probe_duration: float) -> str:
        return (
            "[Parsed_blackdetect_0] black_start:0 "
            f"black_end:{probe_duration} black_duration:{probe_duration}"
        )

    monkeypatch.setattr(MediaProber, "_probe_trailing_black_window", fake_probe)

    assert MediaProber.detect_trailing_black_start("all-black.mp4") == 0.0


def test_detect_trailing_black_start_with_real_ffmpeg(tmp_path):
    video_path = tmp_path / "trailing-black.mp4"
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=64x64:r=10:d=1",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=64x64:r=10:d=2",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[outv]",
            "-map",
            "[outv]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )

    trailing_black_start = MediaProber.detect_trailing_black_start(
        str(video_path),
        initial_probe_duration=0.5,
    )

    assert trailing_black_start == pytest.approx(1.0, abs=0.12)

import subprocess
from pathlib import Path

from backend.config import settings
from backend.services.video_synthesizer import VideoSynthesizer


def test_burn_in_subtitles_succeeds_for_video_without_audio(tmp_path):
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

    result_path = VideoSynthesizer().burn_in_subtitles(
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

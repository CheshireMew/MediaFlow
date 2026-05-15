import subprocess
from pathlib import Path

from backend.config import settings
from backend.services.video.encoder_config import EncoderConfigResolver
from backend.services.video.ffmpeg_runner import FfmpegRunner
from backend.services.video.filter_graph_builder import FilterGraphBuilder
from backend.services.video.super_resolution_stage import SuperResolutionStage
from backend.services.video.synthesis import SynthesisOrchestrator


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
        super_resolution_stage=SuperResolutionStage(),
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


def test_super_resolution_stage_uses_short_temp_output_path(monkeypatch, tmp_path):
    long_name = (
        "X 上的 CopyRebeldia Hoy una industria entera dejo de tener sentido "
        "un tio publico en GitHub un repo que convierte cualquier foto en un mundo 3D.mp4"
    )
    video_path = tmp_path / long_name
    video_path.write_bytes(b"fake-video")
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    captured_output_paths: list[Path] = []

    class FakeEnhancer:
        def is_available(self, method):
            return True

        def upscale(self, *, input_path, output_path, scale, method, progress_callback):
            captured_output_paths.append(Path(output_path))
            Path(output_path).write_bytes(b"upscaled")
            if progress_callback:
                progress_callback(100, "done")

    monkeypatch.setattr(settings, "ENABLE_EXPERIMENTAL_PREPROCESSING", True)
    monkeypatch.setattr(settings, "TEMP_DIR", temp_dir)

    emitted = []
    result = SuperResolutionStage(FakeEnhancer()).prepare(
        str(video_path),
        {"target_resolution": "sr_realesrgan_4x"},
        lambda progress, message: emitted.append((progress, message)),
    )

    assert len(captured_output_paths) == 1
    output_path = captured_output_paths[0]
    assert output_path.parent == temp_dir
    assert output_path.name.startswith("sr_realesrgan_4x_")
    assert long_name not in output_path.name
    assert result.video_path == str(output_path)
    assert result.temp_path == str(output_path)
    assert result.options["target_resolution"] == "original"

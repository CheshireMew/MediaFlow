from pathlib import Path

from backend.services.downloader.config_builder import YtDlpConfigBuilder


def test_config_builder_uses_custom_output_directory(tmp_path: Path):
    builder = YtDlpConfigBuilder(tmp_path)

    options = builder.build(
        url="https://example.com/video",
        filename="sample-video",
    )

    assert options["outtmpl"] == str(tmp_path / "sample-video.%(ext)s")

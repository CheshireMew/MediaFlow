from pathlib import Path

from backend.services.cookie_manager import CookieManager
from backend.services.downloader.config_builder import YtDlpConfigBuilder


def test_config_builder_uses_custom_output_directory(tmp_path: Path):
    builder = YtDlpConfigBuilder(tmp_path, cookie_manager=CookieManager())

    options = builder.build(
        url="https://example.com/video",
        filename="sample-video",
    )

    assert options["outtmpl"] == str(tmp_path / "sample-video.%(ext)s")

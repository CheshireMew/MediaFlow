from pathlib import Path

from backend.services.cookie_manager import CookieManager
from backend.services.downloader.config_builder import YtDlpConfigBuilder
from backend.services.ytdlp_runtime_options import YtDlpRuntimeOptions


def test_config_builder_uses_custom_output_directory(tmp_path: Path):
    builder = YtDlpConfigBuilder(
        tmp_path,
        runtime_options=YtDlpRuntimeOptions(cookie_manager=CookieManager()),
    )

    options = builder.build_media_download(
        url="https://example.com/video",
        filename="sample-video",
    )

    assert options["outtmpl"] == str(tmp_path / "sample-video.%(ext)s")


def test_config_builder_applies_shared_ytdlp_runtime_options(tmp_path: Path):
    builder = YtDlpConfigBuilder(
        tmp_path,
        runtime_options=YtDlpRuntimeOptions(cookie_manager=CookieManager()),
    )

    options = builder.build_media_download(url="https://example.com/video")

    assert options["retries"] == 10
    assert options["fragment_retries"] == 10
    assert options["extractor_retries"] == 5
    assert options["file_access_retries"] == 3
    assert "user_agent" in options

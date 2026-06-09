import pytest

from backend.services.downloader.progress import clean_ansi
from backend.services.downloader.service import DownloaderService
from backend.services.cookie_manager import CookieManager
from backend.services.platforms.factory import PlatformFactory


def make_downloader() -> DownloaderService:
    return DownloaderService(
        platform_factory=PlatformFactory(),
        cookie_manager=CookieManager(),
    )

def test_clean_ansi():
    """Test removal of ANSI escape sequences from strings."""
    text = "\u001b[31mRed Text\u001b[0m"
    assert clean_ansi(text) == "Red Text"
    
    text2 = "Normal Text"
    assert clean_ansi(text2) == "Normal Text"

def test_downloader_init():
    """Test downloader service initialized with correct output dir."""
    from backend.config import settings
    service = make_downloader()
    assert service.output_dir == settings.WORKSPACE_DIR


def test_youtube_auth_error_retries_with_browser_cookies(monkeypatch):
    service = make_downloader()
    calls = []

    def fake_execute(*, url, ydl_opts, require_prepared_path):
        calls.append(dict(ydl_opts))
        if len(calls) == 1:
            raise RuntimeError("HTTP Error 403: Forbidden")
        return {"title": "ok"}, "video.mp4"

    monkeypatch.setattr(service, "_execute_yt_dlp_download", fake_execute)

    info, path = service._execute_yt_dlp_download_with_retry(
        url="https://www.youtube.com/watch?v=abc",
        ydl_opts={},
        require_prepared_path=True,
        classify_url="https://www.youtube.com/watch?v=abc",
        operation_name="media download",
    )

    assert info["title"] == "ok"
    assert path == "video.mp4"
    assert calls[0].get("cookiesfrombrowser") is None
    assert calls[1]["cookiesfrombrowser"] == ("chrome", None, None, None)


def test_youtube_auth_error_does_not_read_browser_cookies_when_cookiefile_is_set(monkeypatch):
    service = make_downloader()

    def fake_execute(*, url, ydl_opts, require_prepared_path):
        raise RuntimeError("HTTP Error 403: Forbidden")

    monkeypatch.setattr(service, "_execute_yt_dlp_download", fake_execute)

    with pytest.raises(RuntimeError, match="403"):
        service._execute_yt_dlp_download_with_retry(
            url="https://www.youtube.com/watch?v=abc",
            ydl_opts={"cookiefile": "cookies.txt"},
            require_prepared_path=True,
            classify_url="https://www.youtube.com/watch?v=abc",
            operation_name="media download",
        )

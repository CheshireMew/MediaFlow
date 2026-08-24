from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from loguru import logger

from backend.config import settings
from backend.services.cookie_manager import CookieManager


class YtDlpRuntimeOptions:
    def __init__(self, *, cookie_manager: CookieManager):
        self._cookie_manager = cookie_manager

    def build_base(
        self,
        *,
        url: str,
        proxy: Optional[str] = None,
        cookie_file: Optional[str] = None,
        logger_sink: Optional[Any] = None,
        include_referer: bool = False,
    ) -> dict[str, Any]:
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "ffmpeg_location": self._resolve_ffmpeg_location(),
            "retries": 10,
            "fragment_retries": 10,
            "extractor_retries": 5,
            "file_access_retries": 3,
        }

        resolved_proxy = proxy or settings.DOWNLOADER_PROXY
        if resolved_proxy:
            opts["proxy"] = resolved_proxy

        resolved_cookie_file = self.detect_cookie_file(url, cookie_file)
        if resolved_cookie_file:
            opts["cookiefile"] = resolved_cookie_file

        if logger_sink:
            opts["logger"] = logger_sink

        if include_referer and "douyin" in url:
            opts["referer"] = "https://www.douyin.com/"

        return opts

    def detect_cookie_file(
        self,
        url: str,
        cookie_file: Optional[str] = None,
    ) -> Optional[str]:
        if cookie_file:
            return cookie_file

        try:
            domain = urlparse(url).netloc
            detected_cookie: Optional[Path] = None
            if "x.com" in domain or "twitter.com" in domain:
                if self._cookie_manager.has_valid_cookies("x.com"):
                    detected_cookie = self._cookie_manager.get_cookie_path("x.com")
                elif self._cookie_manager.has_valid_cookies("twitter.com"):
                    detected_cookie = self._cookie_manager.get_cookie_path("twitter.com")
            elif self._cookie_manager.has_valid_cookies(domain):
                detected_cookie = self._cookie_manager.get_cookie_path(domain)

            if detected_cookie:
                resolved = str(detected_cookie)
                logger.info(f"Using yt-dlp cookies: {resolved}")
                return resolved
        except Exception as e:
            logger.warning(f"Failed to auto-detect yt-dlp cookies: {e}")
        return None

    @staticmethod
    def _resolve_ffmpeg_location() -> str:
        ffmpeg_exe = settings.BIN_DIR / "ffmpeg.exe"
        if ffmpeg_exe.exists():
            return str(ffmpeg_exe)
        return settings.FFMPEG_PATH

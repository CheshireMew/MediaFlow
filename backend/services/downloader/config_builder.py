from pathlib import Path
from typing import Optional, Dict, Any
from backend.config import settings
from .progress import ProgressHook
from backend.services.cookie_manager import CookieManager
from .artifacts import sanitize_filename
from urllib.parse import urlparse
from loguru import logger

class YtDlpConfigBuilder:
    def __init__(self, output_dir: Path, *, cookie_manager: CookieManager):
        self.output_dir = output_dir
        self._cookie_manager = cookie_manager

    def build_media_download(
        self,
        url: str,
        start_url: Optional[str] = None,
        proxy: Optional[str] = None,
        playlist_title: Optional[str] = None,
        playlist_items: Optional[str] = None,
        download_subs: bool = False,
        resolution: str = "best",
        codec: str = "best", # "best" (default) or "avc" (h264)
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        progress_hook: Optional[ProgressHook] = None
    ) -> Dict[str, Any]:
        output_template = self._get_output_template(playlist_title, filename)
        format_map = settings.DOWNLOADER_FORMATS
        selected_format = format_map.get(resolution, format_map["best"])
        if codec == "avc":
            selected_format = selected_format.replace("bestvideo", "bestvideo[vcodec^=avc]")
            logger.info(f"Targeting H.264 (AVC) codec for resolution: {resolution}")
        return self._build_options(
            url=url,
            start_url=start_url,
            proxy=proxy,
            playlist_items=playlist_items,
            cookie_file=cookie_file,
            output_template=output_template,
            progress_hook=progress_hook,
            selected_format=selected_format,
            download_subs=download_subs,
        )

    def build_subtitle_download(
        self,
        url: str,
        start_url: Optional[str] = None,
        proxy: Optional[str] = None,
        playlist_title: Optional[str] = None,
        playlist_items: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        progress_hook: Optional[ProgressHook] = None,
    ) -> Dict[str, Any]:
        output_template = self._get_output_template(playlist_title, filename)
        opts = self._build_options(
            url=url,
            start_url=start_url,
            proxy=proxy,
            playlist_items=playlist_items,
            cookie_file=cookie_file,
            output_template=output_template,
            progress_hook=progress_hook,
            selected_format="best",
            download_subs=True,
        )
        opts["skip_download"] = True
        return opts

    def _build_options(
        self,
        *,
        url: str,
        start_url: Optional[str],
        proxy: Optional[str],
        playlist_items: Optional[str],
        cookie_file: Optional[str],
        output_template: str,
        progress_hook: Optional[ProgressHook],
        selected_format: str,
        download_subs: bool,
    ) -> Dict[str, Any]:
        ffmpeg_exe = settings.BIN_DIR / "ffmpeg.exe"
        ffmpeg_location = str(ffmpeg_exe) if ffmpeg_exe.exists() else settings.FFMPEG_PATH
        resolved_cookie_file = self._detect_cookie_file(url, cookie_file)
        opts = {
            "format": selected_format,
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "proxy": proxy or settings.DOWNLOADER_PROXY,
            "ffmpeg_location": ffmpeg_location,
            "cookiefile": resolved_cookie_file,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "writesubtitles": download_subs,
            "writeautomaticsub": download_subs,
            "subtitleslangs": ["en", "zh"] if download_subs else [],
            "nooverwrites": True,
            "continuedl": True,
            "ignoreerrors": False,
            "referer": "https://www.douyin.com/" if "douyin" in str(start_url or url) else None,
        }
        if playlist_items:
            opts["playlist_items"] = playlist_items
            opts["noplaylist"] = False
        else:
            opts["noplaylist"] = True
        if progress_hook:
            opts["progress_hooks"] = [progress_hook]
        return opts

    def _detect_cookie_file(self, url: str, cookie_file: Optional[str]) -> Optional[str]:
        if cookie_file:
            return cookie_file

        try:
            domain = urlparse(url).netloc
            detected_cookie = None
            if "x.com" in domain or "twitter.com" in domain:
                if self._cookie_manager.has_valid_cookies("x.com"):
                    detected_cookie = self._cookie_manager.get_cookie_path("x.com")
                elif self._cookie_manager.has_valid_cookies("twitter.com"):
                    detected_cookie = self._cookie_manager.get_cookie_path("twitter.com")
            elif self._cookie_manager.has_valid_cookies(domain):
                detected_cookie = self._cookie_manager.get_cookie_path(domain)

            if detected_cookie:
                resolved = str(detected_cookie)
                logger.info(f"Auto-detected cookies for download: {resolved}")
                return resolved
        except Exception as e:
            logger.warning(f"Failed to auto-detect cookies: {e}")
        return None

    def _get_output_template(self, playlist_title: Optional[str], filename: Optional[str]) -> str:
        if playlist_title:
            safe_playlist_title = sanitize_filename(playlist_title)
            target_dir = self.output_dir / safe_playlist_title
            target_dir.mkdir(parents=True, exist_ok=True)
            if filename:
                return str(target_dir / f"{sanitize_filename(filename)}.%(ext)s")
            else:
                return str(target_dir / "%(title)s [%(id)s].%(ext)s")
        else:
            if filename:
                return str(self.output_dir / f"{sanitize_filename(filename)}.%(ext)s")
            else:
                return str(self.output_dir / "%(title)s [%(id)s].%(ext)s")

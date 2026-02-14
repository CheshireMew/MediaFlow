from pathlib import Path
from typing import Optional, Dict, Any
from src.config import settings
from .progress import ProgressHook
from src.services.cookie_manager import CookieManager
from urllib.parse import urlparse
from loguru import logger

class YtDlpConfigBuilder:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir

    def build(
        self,
        url: str,
        start_url: Optional[str] = None,
        proxy: Optional[str] = None,
        playlist_title: Optional[str] = None,
        download_subs: bool = False,
        resolution: str = "best",
        codec: str = "best", # "best" (default) or "avc" (h264)
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        progress_hook: Optional[ProgressHook] = None
    ) -> Dict[str, Any]:
        
        # 1. Check for local ffmpeg in bin/ folder
        ffmpeg_exe = settings.BIN_DIR / "ffmpeg.exe"
        ffmpeg_location = str(ffmpeg_exe) if ffmpeg_exe.exists() else settings.FFMPEG_PATH
        
        # 1.5 Auto-detect Cookies if not provided
        if not cookie_file:
            try:
                domain = urlparse(url).netloc
                cm = CookieManager()
                detected_cookie = None
                
                # Special handling for X/Twitter domain sharing
                if "x.com" in domain or "twitter.com" in domain:
                    if cm.has_valid_cookies("x.com"):
                        detected_cookie = cm.get_cookie_path("x.com")
                    elif cm.has_valid_cookies("twitter.com"):
                        detected_cookie = cm.get_cookie_path("twitter.com")
                # Generic handling
                elif cm.has_valid_cookies(domain):
                     detected_cookie = cm.get_cookie_path(domain)
                
                if detected_cookie:
                    cookie_file = str(detected_cookie)
                    logger.info(f"Auto-detected cookies for download: {cookie_file}")
            except Exception as e:
                logger.warning(f"Failed to auto-detect cookies: {e}")

        
        # 2. Construct Output Template
        output_template = self._get_output_template(playlist_title, filename)

        # 3. Map Resolution & Codec
        format_map = settings.DOWNLOADER_FORMATS
        selected_format = format_map.get(resolution, format_map["best"])
        
        # Inject H.264 preference if requested
        if codec == "avc":
            # Replace 'bestvideo' with 'bestvideo[vcodec^=avc]' to prioritize H.264
            # This works for both standalone and combined formats
            selected_format = selected_format.replace("bestvideo", "bestvideo[vcodec^=avc]")
            logger.info(f"Targeting H.264 (AVC) codec for resolution: {resolution}")
        
        # 4. Build Options
        opts = {
            'format': selected_format,
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'proxy': proxy or settings.DOWNLOADER_PROXY,
            'ffmpeg_location': ffmpeg_location,
            # 'restrictfilenames': True, # User prefers natural filenames; 403 was likely the real issue
            'cookiefile': cookie_file,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'writesubtitles': download_subs,
            'writeautomaticsub': download_subs,
            'subtitleslangs': ['en', 'zh'] if download_subs else [],
            'nooverwrites': True,
            'continuedl': True,
            'ignoreerrors': False, # Fail on error (e.g. 403) so we know why download failed
            'referer': 'https://www.douyin.com/' if 'douyin' in str(start_url or url) else None,
        }

        if progress_hook:
            opts['progress_hooks'] = [progress_hook]

        return opts

    def _get_output_template(self, playlist_title: Optional[str], filename: Optional[str]) -> str:
        if playlist_title:
             # Sanitize playlist title
            safe_playlist_title = "".join([c for c in playlist_title if c.isalpha() or c.isdigit() or c in ' -_[]']).rstrip()
            target_dir = self.output_dir / safe_playlist_title
            target_dir.mkdir(parents=True, exist_ok=True)
            if filename:
                 safe_name = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
                 return str(target_dir / f"{safe_name}.%(ext)s")
            else:
                 return str(target_dir / "%(title)s [%(id)s].%(ext)s")
        else:
            if filename:
                 safe_name = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
                 return str(self.output_dir / f"{safe_name}.%(ext)s")
            else:
                return str(self.output_dir / "%(title)s [%(id)s].%(ext)s")

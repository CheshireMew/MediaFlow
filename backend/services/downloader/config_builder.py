from pathlib import Path
from typing import Optional, Dict, Any
from backend.config import settings
from .progress import ProgressHook
from .artifacts import sanitize_filename
from loguru import logger
from backend.services.ytdlp_runtime_options import YtDlpRuntimeOptions

class YtDlpConfigBuilder:
    def __init__(self, output_dir: Path, *, runtime_options: YtDlpRuntimeOptions):
        self.output_dir = output_dir
        self._runtime_options = runtime_options

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
        opts = {
            **self._runtime_options.build_base(
                url=start_url or url,
                proxy=proxy,
                cookie_file=cookie_file,
                include_referer=True,
            ),
            "format": selected_format,
            "outtmpl": output_template,
            "writesubtitles": download_subs,
            "writeautomaticsub": download_subs,
            "subtitleslangs": ["en", "zh"] if download_subs else [],
            "nooverwrites": True,
            "continuedl": True,
            "ignoreerrors": False,
        }
        if playlist_items:
            opts["playlist_items"] = playlist_items
            opts["noplaylist"] = False
        else:
            opts["noplaylist"] = True
        if progress_hook:
            opts["progress_hooks"] = [progress_hook]
        return opts

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

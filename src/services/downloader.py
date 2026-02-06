import yt_dlp
from pathlib import Path
from loguru import logger
import uuid
import asyncio
from typing import Optional, Callable, Dict
from src.config import settings
from src.models.schemas import MediaAsset
from src.services.platforms.factory import PlatformFactory
from src.utils.subtitle_manager import SubtitleManager
import re
import time

# Type aliases for callback functions
ProgressCallback = Callable[[float, str], None]  # (progress: float, message: str) -> None
CancelCheckCallback = Callable[[], bool]          # () -> bool (True if cancelled)

def clean_ansi(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

class DownloaderService:
    def __init__(self):
        self.output_dir = settings.TEMP_DIR

    async def download(
        self,
        url: str,
        proxy: Optional[str] = None,
        playlist_title: Optional[str] = None,
        progress_callback: Optional[ProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        local_source: Optional[str] = None
    ) -> MediaAsset:
        """
        Async download entry point.
        1. Analyzes URL via PlatformFactory (Strategy Pattern)
        2. Offloads blocking download to thread executor
        """
        # 1. Strategy Analysis
        handler = await PlatformFactory.get_handler(url)
        final_url = url
        final_title = filename
        
        if handler:
            logger.info(f"Using platform handler: {handler.__class__.__name__}")
            try:
                # Analyze to get direct URL or metadata
                # Note: For now we handle single video. Playlist logic requires more changes (returning list of assets)
                # But existing code structure expects a single MediaAsset return.
                # If analysis returns playlist, we might need a different flow. 
                # For this refactor, we stick to single video optimization (Douyin direct link).
                
                result = await handler.analyze(url)
                if result:
                    if result.type == 'single':
                        if result.direct_src:
                            logger.info(f"Resolved direct URL: {result.direct_src[:50]}...")
                            final_url = result.direct_src
                        if result.title and not final_title:
                            final_title = result.title
            except Exception as e:
                logger.error(f"Platform analysis failed, falling back to default: {e}")

        # 2. Execution (Blocking)
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._perform_download_sync(
                url=final_url,
                start_url=url, # Pass original URL for reference/headers
                proxy=proxy,
                playlist_title=playlist_title,
                progress_callback=progress_callback,
                check_cancel_callback=check_cancel_callback,
                download_subs=download_subs,
                resolution=resolution,
                task_id=task_id,
                cookie_file=cookie_file,
                filename=final_title, # passed as filename
                local_source=local_source
            )
        )

    def _perform_download_sync(
        self,
        url: str,
        start_url: Optional[str] = None,
        proxy: Optional[str] = None,
        playlist_title: Optional[str] = None,
        progress_callback: Optional[ProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        local_source: Optional[str] = None
    ) -> MediaAsset:
        """
        Synchronous download using yt-dlp.
        Internal method, run in executor.
        """
        if playlist_title:
             # Sanitize playlist title to be safe for directory name
            safe_playlist_title = "".join([c for c in playlist_title if c.isalpha() or c.isdigit() or c in ' -_[]']).rstrip()
            target_dir = self.output_dir / safe_playlist_title
            target_dir.mkdir(parents=True, exist_ok=True)
            if filename:
                 # Use provided filename but still in playlist folder
                 safe_name = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
                 output_template = str(target_dir / f"{safe_name}.%(ext)s")
            else:
                 output_template = str(target_dir / "%(title)s [%(id)s].%(ext)s")
        else:
            if filename:
                 safe_name = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
                 output_template = str(self.output_dir / f"{safe_name}.%(ext)s")
            else:
                output_template = str(self.output_dir / "%(title)s [%(id)s].%(ext)s")
        
        # Bypass download if we have a local source (Electron direct download)
        if local_source:
            local_source = Path(local_source)
            if local_source.exists():
                # Manually construct filename since we don't have yt-dlp info dict yet
                # Ensure safe_name is defined even if not provided in kwargs
                safe_name_local = safe_name if 'safe_name' in locals() else "".join([c for c in (filename or f"Douyin_Video_{int(time.time())}") if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
                
                final_stem = safe_name_local
                final_path = Path(output_template.replace("%(title)s", "Douyin_Video").replace("%(id)s", "Direct").replace("%(ext)s", "mp4"))
                
                # If template had wildcards, we need a concrete path. 
                # Simpler approach: Use target_dir / filename
                dest_dir = Path(output_template).parent
                dest_path = dest_dir / f"{final_stem}.mp4"
                
                logger.info(f"Moving local file {local_source} to {dest_path}")
                import shutil
                shutil.move(str(local_source), str(dest_path))
                
                return MediaAsset(
                    id=task_id or str(uuid.uuid4()),
                    title=filename or "Douyin Direct Video",
                    video_path=str(dest_path),
                    duration=0, # Unknown without probing
                    source_url=url
                )

        # Check for local ffmpeg in bin/ folder
        ffmpeg_exe = settings.BIN_DIR / "ffmpeg.exe"
        ffmpeg_location = str(ffmpeg_exe) if ffmpeg_exe.exists() else settings.FFMPEG_PATH
        
        # Map resolution to format
        format_map = {
            "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
            "4k": "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/mp4",
            "2k": "bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/mp4",
            "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/mp4",
            "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/mp4",
            "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/mp4",
            "audio": "bestaudio/best"
        }
        selected_format = format_map.get(resolution, format_map["best"])

        ydl_opts = {
            'format': selected_format,
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'proxy': proxy,
            'ffmpeg_location': ffmpeg_location,
            'cookiefile': cookie_file,  # Add cookie file support
            # Match Browser User-Agent to ensure cookies work
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'progress_hooks': [
                lambda d: self._progress_hook(d, progress_callback, check_cancel_callback)
            ],
            # Subtitle options
            'writesubtitles': download_subs,
            'writeautomaticsub': download_subs,
            'subtitleslangs': ['en', 'zh'] if download_subs else [],
            # Smart completion options
            'nooverwrites': True,
            'continuedl': True,
            'ignoreerrors': True, # Skip failed videos in playlist
            # Referer is also important for Douyin (if using original URL)
            # If using direct URL, sometimes no referer is better, or specific referer
            'referer': 'https://www.douyin.com/' if 'douyin' in (start_url or url) else None,
        }

        logger.info(f"Starting download: {url}")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise Exception("Download failed, cancelled, or no info returned")
            filename = ydl.prepare_filename(info)
            
            # Retrieve actual duration/title
            duration = info.get('duration')
            title = info.get('title')
            
            # Post-processing: Clean subtitles if requested
            if download_subs:
                 SubtitleManager.process_vtt_file(Path(filename))

            logger.success(f"Download complete: {filename}")
            
            return MediaAsset(
                id=task_id or str(uuid.uuid4()),
                filename=Path(filename).name,
                path=filename,
                duration=duration,
                title=title
            )



    def _progress_hook(
        self,
        d: Dict,
        progress_callback: Optional[ProgressCallback],
        check_cancel_callback: Optional[CancelCheckCallback]
    ) -> None:
        # 1. Check for cancellation
        if check_cancel_callback and check_cancel_callback():
            raise Exception("Download cancelled by user")

        # 2. Update progress
        if d['status'] == 'downloading':
            try:
                # Extract percentage
                raw_percent = d.get('_percent_str', '0%')
                clean_percent = clean_ansi(raw_percent).replace('%','')
                percent = float(clean_percent) if clean_percent != 'N/A' else 0.0
                
                if progress_callback:
                    progress_callback(percent, f"Downloading: {clean_ansi(d.get('_percent_str'))} - {clean_ansi(d.get('_eta_str'))} left")
            except Exception as e:
                logger.warning(f"Error in progress hook: {e}")
                
        elif d['status'] == 'finished':
            if progress_callback:
                progress_callback(100.0, "Processing completed")



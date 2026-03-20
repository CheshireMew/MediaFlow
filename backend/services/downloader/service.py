import asyncio
import uuid
import time
from pathlib import Path
from typing import Optional, List, Callable
from concurrent.futures import ThreadPoolExecutor

import yt_dlp
from loguru import logger

from backend.config import settings
from backend.models.schemas import TaskResult, FileRef
from backend.services.platforms.factory import PlatformFactory
from backend.utils.subtitle_manager import SubtitleManager

from .config_builder import YtDlpConfigBuilder
from .post_processor import DownloadPostProcessor
from .progress import ProgressHook, ProgressCallback, CancelCheckCallback


def _infer_media_file_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg"}:
        return "audio"
    return "video"


class DownloaderService:
    def __init__(self):
        self.output_dir = settings.WORKSPACE_DIR
        self.config_builder = YtDlpConfigBuilder(self.output_dir)
        self.post_processor = DownloadPostProcessor()

    async def download(
        self,
        url: str,
        proxy: Optional[str] = None,
        output_dir: Optional[str] = None,
        playlist_title: Optional[str] = None,
        playlist_items: Optional[str] = None,
        progress_callback: Optional[ProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        local_source: Optional[str] = None,
        codec: str = "best"
    ) -> TaskResult:
        """
        Async download entry point.
        """
        # Normalize URL
        url = str(url)
        
        # 1. Strategy Analysis
        handler = await PlatformFactory.get_handler(url)
        final_url = url
        final_title = filename
        
        if handler:
            logger.info(f"Using platform handler: {handler.__class__.__name__}")
            try:
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
                start_url=url,
                proxy=proxy,
                output_dir=output_dir,
                playlist_title=playlist_title,
                playlist_items=playlist_items,
                progress_callback=progress_callback,
                check_cancel_callback=check_cancel_callback,
                download_subs=download_subs,
                resolution=resolution,
                task_id=task_id,
                cookie_file=cookie_file,
                filename=final_title,
                local_source=local_source,
                codec=codec
            )
        )

    def _perform_download_sync(
        self,
        url: str,
        start_url: Optional[str] = None,
        proxy: Optional[str] = None,
        output_dir: Optional[str] = None,
        playlist_title: Optional[str] = None,
        playlist_items: Optional[str] = None,
        progress_callback: Optional[ProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        local_source: Optional[str] = None,
        codec: str = "best"
    ) -> TaskResult:
        
        # 1. Handle Local Source (Direct Download)
        if local_source:
             return self._handle_local_source(
                 local_source, url, filename, playlist_title, task_id, output_dir
             )

        # 2. Build Configuration
        target_output_dir = Path(output_dir) if output_dir else self.output_dir
        target_output_dir.mkdir(parents=True, exist_ok=True)
        progress_hook = ProgressHook(progress_callback, check_cancel_callback)
        ydl_opts = YtDlpConfigBuilder(target_output_dir).build(
            url=url,
            start_url=start_url,
            proxy=proxy,
            playlist_title=playlist_title,
            playlist_items=playlist_items,
            download_subs=download_subs,
            resolution=resolution,
            cookie_file=cookie_file,
            filename=filename,
            progress_hook=progress_hook,
            codec=codec
        )
        
        # 3. Execute Download
        logger.info(f"Starting download: {url}")
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if not info:
                    return TaskResult(success=False, error="Download failed: No info returned")
                downloaded_path = ydl.prepare_filename(info)
        except Exception as e:
            logger.error(f"yt-dlp download failed: {e}")
            return TaskResult(success=False, error=f"Download failed: {e}")

        duration = info.get('duration', 0)
        title = info.get('title', "Unknown Title")

        # Robustness: Check if file exists vs what yt-dlp predicted (e.g. .NA extension issue)
        dpath = Path(downloaded_path)
        if not dpath.exists():
            logger.warning(f"File not found at expected path: {dpath}. Searching for alternatives...")
            # Search in same dir for files with same name but different extension
            candidates = list(dpath.parent.glob(f"{dpath.stem}.*"))
            if candidates:
                # Prefer video/audio extensions
                candidates.sort(key=lambda p: p.suffix in ['.mp4', '.mkv', '.webm', '.m4a', '.mp3'], reverse=True)
                downloaded_path = str(candidates[0])
                logger.info(f"Found actual file at: {downloaded_path}")
            else:
                return TaskResult(success=False, error=f"File not found: {dpath}")

        # 4. Post Processing
        subtitle_path = self.post_processor.process_subtitles(Path(downloaded_path), download_subs)

        logger.success(f"Download complete: {downloaded_path}")

        files = [
            FileRef(
                type=_infer_media_file_type(str(downloaded_path)),
                path=str(downloaded_path),
                label="source",
            )
        ]
        if subtitle_path:
            files.append(FileRef(type="subtitle", path=str(subtitle_path), label="downloaded"))

        return TaskResult(
            success=True,
            files=files,
            meta={
                "id": task_id or str(uuid.uuid4()),
                "title": title,
                "duration": duration,
                "filename": Path(downloaded_path).name,
                "source_url": url
            }
        )

    def _handle_local_source(
        self,
        local_source: str,
        url: str,
        filename: Optional[str],
        playlist_title: Optional[str],
        task_id: Optional[str],
        output_dir: Optional[str] = None,
    ) -> TaskResult:
        local_path = Path(local_source)
        if not local_path.exists():
             return TaskResult(success=False, error=f"Local source not found: {local_source}")

        # Determine destination
        base_output_dir = Path(output_dir) if output_dir else self.output_dir
        if playlist_title:
             safe_playlist_title = "".join([c for c in playlist_title if c.isalpha() or c.isdigit() or c in ' -_[]']).rstrip()
             dest_dir = base_output_dir / safe_playlist_title
        else:
             dest_dir = base_output_dir
        
        dest_dir.mkdir(parents=True, exist_ok=True)
        final_name = filename or f"Douyin_Video_{int(time.time())}"
        
        dest_path = self.post_processor.process_local_file(local_path, dest_dir, final_name)
        
        return TaskResult(
            success=True,
            files=[
                FileRef(
                    type=_infer_media_file_type(str(dest_path)),
                    path=str(dest_path),
                    label="source",
                )
            ],
            meta={
                "id": task_id or str(uuid.uuid4()),
                "title": final_name,
                "duration": 0,
                "filename": dest_path.name,
                "source_url": url
            }
        )

    def _clean_subtitles(self, subtitle_path: str) -> Optional[Path]:
        """
        Backward-compatible helper retained for tests and older callers.
        Converts a VTT subtitle file to SRT using the shared subtitle parser.
        """
        path = Path(subtitle_path)
        return SubtitleManager.process_vtt_file(path)

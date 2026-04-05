import asyncio
import time
import uuid
from pathlib import Path
from typing import Optional

import yt_dlp
from loguru import logger

from backend.config import settings
from backend.models.schemas import TaskResult
from backend.services.cookie_manager import CookieManager
from backend.services.platforms.factory import PlatformFactory

from .artifacts import DownloadArtifactResolver, sanitize_filename
from .config_builder import YtDlpConfigBuilder
from .post_processor import DownloadPostProcessor
from .progress import CancelCheckCallback, ProgressCallback, ProgressHook


class DownloaderService:
    def __init__(
        self,
        *,
        platform_factory: PlatformFactory,
        cookie_manager: CookieManager,
    ):
        self.output_dir = settings.WORKSPACE_DIR
        self._cookie_manager = cookie_manager
        self._platform_factory = platform_factory
        self._artifact_resolver = DownloadArtifactResolver()
        self._post_processor = DownloadPostProcessor()

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
        codec: str = "best",
    ) -> TaskResult:
        url = str(url)

        handler = await self._platform_factory.get_handler(url)
        final_url = url
        final_title = filename

        if handler:
            logger.info(f"Using platform handler: {handler.__class__.__name__}")
            try:
                result = await handler.analyze(url)
                if result and result.type == "single":
                    if result.direct_src:
                        logger.info(f"Resolved direct URL: {result.direct_src[:50]}...")
                        final_url = result.direct_src
                    if result.title and not final_title:
                        final_title = result.title
            except Exception as e:
                logger.error(f"Platform analysis failed, falling back to default: {e}")

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
                codec=codec,
            ),
        )

    def _perform_download_sync(
        self,
        *,
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
        codec: str = "best",
    ) -> TaskResult:
        if local_source:
            return self._handle_local_source(
                local_source=local_source,
                url=url,
                filename=filename,
                playlist_title=playlist_title,
                task_id=task_id,
                output_dir=output_dir,
            )

        target_output_dir = Path(output_dir) if output_dir else self.output_dir
        target_output_dir.mkdir(parents=True, exist_ok=True)
        config_builder = YtDlpConfigBuilder(
            target_output_dir,
            cookie_manager=self._cookie_manager,
        )

        media_progress = self._build_phase_progress_callback(
            progress_callback,
            start=0.0,
            end=90.0 if download_subs else 99.0,
        )
        media_hook = ProgressHook(
            media_progress,
            check_cancel_callback,
            stage_label="Media download",
        )
        media_opts = config_builder.build_media_download(
            url=url,
            start_url=start_url,
            proxy=proxy,
            playlist_title=playlist_title,
            playlist_items=playlist_items,
            download_subs=False,
            resolution=resolution,
            cookie_file=cookie_file,
            filename=filename,
            progress_hook=media_hook,
            codec=codec,
        )

        logger.info(f"Starting media download: {url}")
        try:
            media_info, prepared_path = self._execute_yt_dlp_download(
                url=url,
                ydl_opts=media_opts,
                require_prepared_path=True,
            )
        except Exception as e:
            logger.error(f"yt-dlp media download failed: {e}")
            return TaskResult(success=False, error=f"Download failed: {e}")

        subtitle_error: Optional[str] = None
        if download_subs:
            subtitle_progress = self._build_phase_progress_callback(
                progress_callback,
                start=90.0,
                end=99.0,
            )
            subtitle_hook = ProgressHook(
                subtitle_progress,
                check_cancel_callback,
                stage_label="Subtitle download",
            )
            subtitle_opts = config_builder.build_subtitle_download(
                url=url,
                start_url=start_url,
                proxy=proxy,
                playlist_title=playlist_title,
                playlist_items=playlist_items,
                cookie_file=cookie_file,
                filename=filename,
                progress_hook=subtitle_hook,
            )
            try:
                logger.info(f"Starting subtitle download: {url}")
                self._execute_yt_dlp_download(
                    url=url,
                    ydl_opts=subtitle_opts,
                    require_prepared_path=False,
                )
            except Exception as e:
                subtitle_error = str(e)
                logger.warning(f"Subtitle download failed after media completed: {e}")
                if progress_callback:
                    progress_callback(99.0, "Subtitle download failed, keeping media")

        duration = media_info.get("duration", 0)
        title = media_info.get("title") or "Unknown Title"

        try:
            artifacts = self._artifact_resolver.finalize_download(
                info=media_info,
                prepared_path=prepared_path,
                subtitle_requested=download_subs,
                preferred_stem=filename or title,
                subtitle_error=subtitle_error,
            )
        except Exception as e:
            logger.error(f"Download artifact resolution failed: {e}")
            return TaskResult(success=False, error=f"Download failed: {e}")

        if progress_callback:
            progress_callback(100.0, "Download completed")

        logger.success(f"Download complete: {artifacts.media_path}")
        return TaskResult(
            success=True,
            files=artifacts.to_files(),
            meta={
                "id": task_id or str(uuid.uuid4()),
                "title": title,
                "duration": duration,
                "filename": artifacts.media_path.name,
                "source_url": url,
                "download_artifacts": artifacts.to_meta(),
            },
        )

    def _handle_local_source(
        self,
        *,
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

        base_output_dir = Path(output_dir) if output_dir else self.output_dir
        if playlist_title:
            safe_playlist_title = sanitize_filename(playlist_title).rstrip()
            dest_dir = base_output_dir / safe_playlist_title
        else:
            dest_dir = base_output_dir

        dest_dir.mkdir(parents=True, exist_ok=True)
        final_name = filename or f"Douyin_Video_{int(time.time())}"
        dest_path = self._post_processor.process_local_file(local_path, dest_dir, final_name)
        artifacts = self._artifact_resolver.finalize_existing(
            media_path=dest_path,
            preferred_stem=final_name,
        )

        return TaskResult(
            success=True,
            files=artifacts.to_files(),
            meta={
                "id": task_id or str(uuid.uuid4()),
                "title": final_name,
                "duration": 0,
                "filename": artifacts.media_path.name,
                "source_url": url,
                "download_artifacts": artifacts.to_meta(),
            },
        )

    def _execute_yt_dlp_download(
        self,
        *,
        url: str,
        ydl_opts: dict,
        require_prepared_path: bool,
    ) -> tuple[dict, Optional[str]]:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise RuntimeError("No info returned")
            prepared_path = ydl.prepare_filename(info) if require_prepared_path else None
        return info, prepared_path

    def _build_phase_progress_callback(
        self,
        progress_callback: Optional[ProgressCallback],
        *,
        start: float,
        end: float,
    ) -> Optional[ProgressCallback]:
        if not progress_callback:
            return None

        span = max(end - start, 0.0)

        def report(progress: float, message: str) -> None:
            bounded = max(0.0, min(100.0, float(progress)))
            progress_callback(start + (bounded / 100.0) * span, message)

        return report

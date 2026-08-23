import asyncio
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import yt_dlp
from loguru import logger

from backend.config import settings
from backend.models.media_contracts import TaskResult
from backend.models.task_result_contracts import DownloadOutput, PipelineOutputs
from backend.models.task_message import TaskProgressCallback
from backend.services.cookie_manager import CookieManager
from backend.services.download_errors import classify_download_error
from backend.services.media_url import normalize_media_url
from backend.services.platforms.factory import PlatformFactory
from backend.services.ytdlp_runtime_options import YtDlpRuntimeOptions

from .artifacts import DownloadArtifactResolver, sanitize_filename
from .config_builder import YtDlpConfigBuilder
from .post_processor import DownloadPostProcessor
from .progress import CancelCheckCallback, ProgressHook


class DownloaderService:
    def __init__(
        self,
        *,
        platform_factory: PlatformFactory,
        cookie_manager: CookieManager,
    ):
        self.output_dir = settings.WORKSPACE_DIR
        self._platform_factory = platform_factory
        self._ytdlp_options = YtDlpRuntimeOptions(cookie_manager=cookie_manager)
        self._artifact_resolver = DownloadArtifactResolver()
        self._post_processor = DownloadPostProcessor()

    async def download(
        self,
        url: str,
        proxy: Optional[str] = None,
        output_dir: Optional[str] = None,
        playlist_title: Optional[str] = None,
        playlist_items: Optional[str] = None,
        progress_callback: Optional[TaskProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        local_source: Optional[str] = None,
        codec: str = "best",
    ) -> TaskResult:
        url = normalize_media_url(url)

        handler = await self._platform_factory.get_handler(url)
        final_url = url
        final_title = filename
        resolved_title: Optional[str] = None
        resolved_duration: Optional[float] = None

        if handler:
            logger.info(f"Using platform handler: {handler.__class__.__name__}")
            try:
                result = await handler.analyze(url)
                if result and result.type == "single":
                    resolved_title = result.title
                    resolved_duration = result.duration
                    if result.direct_src:
                        logger.info(f"Resolved direct URL: {result.direct_src[:50]}...")
                        final_url = result.direct_src
                    if not final_title:
                        final_title = result.suggested_filename or result.title
                    if result.media_kind == "audio":
                        resolution = "audio"
                        download_subs = False
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
                resolved_title=resolved_title,
                resolved_duration=resolved_duration,
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
        progress_callback: Optional[TaskProgressCallback] = None,
        check_cancel_callback: Optional[CancelCheckCallback] = None,
        download_subs: bool = False,
        resolution: str = "best",
        task_id: Optional[str] = None,
        cookie_file: Optional[str] = None,
        filename: Optional[str] = None,
        resolved_title: Optional[str] = None,
        resolved_duration: Optional[float] = None,
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
            runtime_options=self._ytdlp_options,
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
            media_info, prepared_path = self._execute_yt_dlp_download_with_retry(
                url=url,
                ydl_opts=media_opts,
                require_prepared_path=True,
                classify_url=start_url or url,
                operation_name="media download",
            )
        except Exception as e:
            classified_error = classify_download_error(e, url=start_url or url)
            logger.error(
                f"yt-dlp media download failed [{classified_error.code}]: {e}"
            )
            return TaskResult(success=False, error=classified_error.display_message)

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
                self._execute_yt_dlp_download_with_retry(
                    url=url,
                    ydl_opts=subtitle_opts,
                    require_prepared_path=False,
                    classify_url=start_url or url,
                    operation_name="subtitle download",
                )
            except Exception as e:
                subtitle_error = str(e)
                logger.warning(f"Subtitle download failed after media completed: {e}")
                if progress_callback:
                    progress_callback(99.0, "download_subtitle_failed", {})

        duration = media_info.get("duration") or resolved_duration or 0
        title = resolved_title or media_info.get("title") or "Unknown Title"

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
            progress_callback(100.0, "download_completed", {})

        logger.success(f"Download complete: {artifacts.media_path}")
        return TaskResult(
            success=True,
            artifacts=artifacts.to_artifacts(),
            outputs=PipelineOutputs(
                download=DownloadOutput(
                    id=task_id or str(uuid.uuid4()),
                    title=title,
                    duration=duration,
                    filename=artifacts.media_path.name,
                    source_url=start_url or url,
                    warnings=list(artifacts.warnings),
                    recovery_strategies=[
                        item["strategy"]
                        for item in artifacts.recovery
                        if "strategy" in item
                    ],
                )
            ),
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
            artifacts=artifacts.to_artifacts(),
            outputs=PipelineOutputs(
                download=DownloadOutput(
                    id=task_id or str(uuid.uuid4()),
                    title=final_name,
                    duration=0,
                    filename=artifacts.media_path.name,
                    source_url=url,
                    warnings=list(artifacts.warnings),
                    recovery_strategies=[
                        item["strategy"]
                        for item in artifacts.recovery
                        if "strategy" in item
                    ],
                )
            ),
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

    def _execute_yt_dlp_download_with_retry(
        self,
        *,
        url: str,
        ydl_opts: dict,
        require_prepared_path: bool,
        classify_url: str,
        operation_name: str,
    ) -> tuple[dict, Optional[str]]:
        max_attempts = 3
        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                return self._execute_yt_dlp_download(
                    url=url,
                    ydl_opts=ydl_opts,
                    require_prepared_path=require_prepared_path,
                )
            except Exception as e:
                last_error = e
                classified_error = classify_download_error(e, url=classify_url)
                if classified_error.code != "network" or attempt >= max_attempts:
                    break
                delay = attempt
                logger.warning(
                    f"yt-dlp {operation_name} failed [{classified_error.code}] "
                    f"on attempt {attempt}/{max_attempts}; retrying in {delay}s: {e}"
                )
                time.sleep(delay)

        if last_error and self._should_retry_with_browser_cookies(
            last_error,
            classify_url=classify_url,
            ydl_opts=ydl_opts,
        ):
            cookie_opts = self._with_browser_cookies(ydl_opts, browser="chrome")
            logger.info(
                "Retrying YouTube {} with browser cookies from Chrome after yt-dlp error: {}",
                operation_name,
                last_error,
            )
            try:
                return self._execute_yt_dlp_download(
                    url=url,
                    ydl_opts=cookie_opts,
                    require_prepared_path=require_prepared_path,
                )
            except Exception as chrome_error:
                edge_opts = self._with_browser_cookies(ydl_opts, browser="edge")
                logger.info(
                    "Retrying YouTube {} with browser cookies from Edge after Chrome cookie retry failed: {}",
                    operation_name,
                    chrome_error,
                )
                return self._execute_yt_dlp_download(
                    url=url,
                    ydl_opts=edge_opts,
                    require_prepared_path=require_prepared_path,
                )

        if last_error:
            raise last_error
        raise RuntimeError("yt-dlp download failed without an error")

    @classmethod
    def _should_retry_with_browser_cookies(
        cls,
        error: Exception,
        *,
        classify_url: str,
        ydl_opts: dict,
    ) -> bool:
        if ydl_opts.get("cookiefile") or ydl_opts.get("cookiesfrombrowser"):
            return False
        if not cls._is_youtube_url(classify_url):
            return False

        classified = classify_download_error(error, url=classify_url)
        if classified.code in {"auth_required", "rate_limited"}:
            return True

        error_text = str(error).lower()
        return any(
            marker in error_text
            for marker in (
                "sabr",
                "po token",
                "potoken",
                "visitor data",
                "http error 403",
                "forbidden",
            )
        )

    @staticmethod
    def _with_browser_cookies(ydl_opts: dict, *, browser: str) -> dict:
        next_opts = dict(ydl_opts)
        next_opts["cookiesfrombrowser"] = (browser, None, None, None)
        return next_opts

    @staticmethod
    def _is_youtube_url(url: str) -> bool:
        try:
            domain = urlparse(url).netloc.lower()
        except Exception:
            return False
        return domain == "youtu.be" or domain.endswith(".youtube.com") or domain == "youtube.com"

    def _build_phase_progress_callback(
        self,
        progress_callback: Optional[TaskProgressCallback],
        *,
        start: float,
        end: float,
    ) -> Optional[TaskProgressCallback]:
        if not progress_callback:
            return None

        span = max(end - start, 0.0)

        def report(progress: float, message_code: str, message_params=None) -> None:
            bounded = max(0.0, min(100.0, float(progress)))
            progress_callback(
                start + (bounded / 100.0) * span,
                message_code,
                message_params or {},
            )

        return report

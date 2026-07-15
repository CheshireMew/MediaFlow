"""
URL Analyzer Service - Detects playlists and extracts metadata using yt-dlp.
"""
import asyncio
import yt_dlp
from loguru import logger
from backend.services.platforms.factory import PlatformFactory
from backend.models.download_contracts import AnalyzeResult, PlaylistItem
from backend.services.cookie_manager import CookieManager
from backend.services.download_errors import (
    DownloadExtractionError,
    YtDlpErrorCapture,
    classify_download_error,
)
from backend.services.media_url import normalize_media_url
from backend.services.ytdlp_runtime_options import YtDlpRuntimeOptions



class AnalyzerService:
    """Analyzes URLs to detect if they contain playlists."""

    def __init__(
        self,
        *,
        platform_factory: PlatformFactory,
        cookie_manager: CookieManager,
    ):
        self._platform_factory = platform_factory
        self._ytdlp_options = YtDlpRuntimeOptions(cookie_manager=cookie_manager)

    async def analyze(self, url: str) -> AnalyzeResult:
        """
        Analyze a URL to determine if it's a single video or playlist.
        Uses PlatformFactory for custom logic, falls back to yt-dlp.
        """
        url = normalize_media_url(url)
        logger.info(f"Analyzing URL: {url}")

        # 1. Try Custom Platform Logic
        platform_handler = await self._platform_factory.get_handler(url)
        if platform_handler:
            logger.info(f"Using Custom Platform Handler: {platform_handler.__class__.__name__}")
            result = await platform_handler.analyze(url)
            if result:
                # If custom handler returns a result (even a partial one), use it.
                # If it returns None, it means it wants to fallback to default logic.
                logger.success(f"Custom Handler Success: {result.title}")
                return self._adapt_result(result)

        # 2. Fallback to yt-dlp (Standard Logic)
        logger.info(f"Fallback to yt-dlp (Version: {yt_dlp.version.__version__})")
        
        error_capture = YtDlpErrorCapture()
        ydl_opts = {
            **self._ytdlp_options.build_base(
                url=url,
                logger_sink=error_capture,
            ),
            'extract_flat': 'in_playlist',  # Don't download, just extract info
            'ignoreerrors': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = await asyncio.to_thread(
                    ydl.extract_info,
                    url,
                    download=False,
                )
            except Exception as e:
                classified_error = classify_download_error(e, url=url)
                logger.error(
                    f"yt-dlp extraction failed [{classified_error.code}]: {e}"
                )
                raise DownloadExtractionError(classified_error) from e

            if info is None:
                classified_error = classify_download_error(
                    error_capture.text or None,
                    url=url,
                    fallback_code="no_info",
                )
                logger.error(
                    f"yt-dlp extraction returned no info [{classified_error.code}]"
                )
                raise DownloadExtractionError(classified_error)

            # Check if it's a playlist
            if info.get('_type') == 'playlist':
                entries = info.get('entries', [])
                items = []
                for i, entry in enumerate(entries):
                    if entry:  # Skip None entries
                        # Keep upstream titles verbatim. Upstream-provided text is the boundary here.
                        # layer guessed encodings here and could turn one bad string
                        # into a different bad string. The actual front/back fix was
                        # to keep IPC and file IO on UTF-8, not to re-decode titles.
                        items.append(PlaylistItem(
                            index=i + 1,
                            title=entry.get('title') or f'Video {i+1}',
                            url=entry.get('url') or entry.get('webpage_url', ''),
                            duration=entry.get('duration'),
                            uploader=entry.get('uploader')
                        ))

                logger.success(f"Detected playlist with {len(items)} items: {info.get('title')}")
                return AnalyzeResult(
                    type="playlist",
                    # UI display should see the raw upstream title; filename safety is
                    # handled later by the downloader artifact resolver.
                    title=info.get('title') or 'Unknown Playlist',
                    url=url,
                    thumbnail=info.get('thumbnail'),
                    count=len(items),
                    items=items,
                    uploader=info.get('uploader'),
                    webpage_url=info.get('webpage_url')
                )
            else:
                # Single video
                logger.success(f"Detected single video: {info.get('title')}")
                return AnalyzeResult(
                    type="single",
                    # Do not guess-decode here. If the provider already gave
                    # us a broken title, preserving it is safer than mutating it into
                    # another irreversible form.
                    title=info.get('title') or 'Unknown Video',
                    url=url,
                    thumbnail=info.get('thumbnail'),
                    duration=info.get('duration'),
                    uploader=info.get('uploader'),
                    webpage_url=info.get('webpage_url')
                )
    
    def _adapt_result(self, result) -> AnalyzeResult:
        """Adapt platform result model to internal AnalyzeResult model if needed."""
        if isinstance(result, AnalyzeResult):
            return result
        return result

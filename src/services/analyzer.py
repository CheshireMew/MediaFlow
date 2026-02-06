"""
URL Analyzer Service - Detects playlists and extracts metadata using yt-dlp.
"""
import yt_dlp
from typing import Optional, List, Union
from pydantic import BaseModel
from loguru import logger
from src.services.platforms.factory import PlatformFactory
from src.models.schemas import AnalyzeResult, PlaylistItem


class AnalyzerService:
    """Analyzes URLs to detect if they contain playlists."""

    async def analyze(self, url: str) -> AnalyzeResult:
        """
        Analyze a URL to determine if it's a single video or playlist.
        Uses PlatformFactory for custom logic, falls back to yt-dlp.
        """
        logger.info(f"Analyzing URL: {url}")

        # 1. Try Custom Platform Logic
        platform_handler = await PlatformFactory.get_handler(url)
        if platform_handler:
            logger.info(f"Using Custom Platform Handler: {platform_handler.__class__.__name__}")
            result = await platform_handler.analyze(url)
            if result:
                # If custom handler returns a result (even a partial one), use it.
                # If it returns None, it means it wants to fallback to default logic.
                logger.success(f"Custom Handler Success: {result.title}")
                return self._adapt_result(result)

        # 2. Fallback to yt-dlp (Standard Logic)
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',  # Don't download, just extract info
            'ignoreerrors': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # yt-dlp is blocking, so we should technically run this in a thread pool executor
            # but for now we keep it simple as this is a fast operation in flat mode.
            info = ydl.extract_info(url, download=False)

            if info is None:
                raise ValueError("Could not extract info from URL")

            # Check if it's a playlist
            if info.get('_type') == 'playlist':
                entries = info.get('entries', [])
                items = []
                for i, entry in enumerate(entries):
                    if entry:  # Skip None entries
                        items.append(PlaylistItem(
                            index=i + 1,
                            title=entry.get('title', f'Video {i+1}'),
                            url=entry.get('url') or entry.get('webpage_url', ''),
                            duration=entry.get('duration'),
                            uploader=entry.get('uploader')
                        ))

                logger.success(f"Detected playlist with {len(items)} items: {info.get('title')}")
                return AnalyzeResult(
                    type="playlist",
                    title=info.get('title', 'Unknown Playlist'),
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
                    title=info.get('title', 'Unknown Video'),
                    url=url,
                    thumbnail=info.get('thumbnail'),
                    duration=info.get('duration'),
                    uploader=info.get('uploader'),
                    webpage_url=info.get('webpage_url')
                )
    
    def _adapt_result(self, result) -> AnalyzeResult:
        """Adapt platform result model to internal AnalyzeResult model if needed."""
        # Currently the platform returns AnalyzeResult compatible dict/obj, 
        # but we ensure strict typing here.
        if isinstance(result, AnalyzeResult):
            return result
        
        # If the platform returns the raw Pydantic model (which it should), just return it.
        # This is a placeholder if we ever need to map fields.
        return result




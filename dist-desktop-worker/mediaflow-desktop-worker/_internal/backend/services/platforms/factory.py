from typing import List, Optional
from backend.services.platforms.base import BasePlatform
from backend.services.platforms.bilibili import BilibiliPlatform
from backend.services.platforms.douyin import DouyinPlatform
from backend.services.platforms.kuaishou import KuaishouPlatform

class PlatformFactory:
    def __init__(self, handlers: Optional[List[BasePlatform]] = None):
        self._handlers: List[BasePlatform] = handlers or []

    def register_handler(self, handler: BasePlatform):
        self._handlers.append(handler)

    async def get_handler(self, url: str) -> Optional[BasePlatform]:
        """Find the first handler that matches the URL."""
        url_str = str(url)  # Ensure url is a string (handles HttpUrl from Pydantic)
        for handler in self._handlers:
            if await handler.match(url_str):
                return handler
        return None  # No specific handler found (caller should fallback to yt-dlp)


def create_default_platform_factory(browser_service, sniffer) -> PlatformFactory:
    return PlatformFactory(
        handlers=[
            BilibiliPlatform(),
            DouyinPlatform(browser_service, sniffer),
            KuaishouPlatform(browser_service, sniffer),
        ]
    )

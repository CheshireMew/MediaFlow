import re
from typing import Optional
from loguru import logger
from src.services.platforms.base import BasePlatform
from src.models.schemas import AnalyzeResult, PlaylistItem
from src.core.container import container, Services

def _get_cookie_manager():
    return container.get(Services.COOKIE_MANAGER)

def _get_browser():
    return container.get(Services.BROWSER)

def _get_sniffer():
    return container.get(Services.SNIFFER)


class DouyinPlatform(BasePlatform):
    """
    Handler for Douyin (TikTok China) URLs.
    
    由于抖音的严格反爬机制，直接 API 调用和 HTML 抓取都不稳定。
    采用简化策略：
    1. analyze 阶段：仅解析 URL 获取视频 ID，返回基本信息
    2. download 阶段：由 DownloaderService 使用 yt-dlp + Cookie 文件下载
    
    Cookie 通过 Electron 浏览器弹窗获取，保存为 Netscape 格式供 yt-dlp 使用。
    """
    
    DOMAIN = "douyin.com"

    async def match(self, url: str) -> bool:
        """Match douyin.com URLs."""
        return "douyin.com" in url

    async def analyze(self, url: str) -> AnalyzeResult:
        logger.info(f"[Douyin] Analyzing URL: {url}")
        
        # 1. Basic URL cleanup and ID extraction (Synchronous)
        video_id = self._extract_video_id(url)
        if not video_id:
             raise ValueError("Could not extract video ID from URL")

        logger.info(f"[Douyin] Extracted ID: {video_id}")

        # 2. Use Playwright to sniff the real video URL
        browser_service = _get_browser()
        sniffer = _get_sniffer()
        
        logger.info(f"[Douyin] Sniffing video URL via Playwright...")
        try:
            # Ensure browser is started (it checks internally)
            await browser_service.start()
            
            sniff_result = await sniffer.sniff(url)
            
            if not sniff_result or not sniff_result.get("url"):
                raise Exception("Failed to sniff video URL from Douyin.")

            direct_url = sniff_result.get("url")
            # Use sniffed title, fallback to generic ID-based title
            title = sniff_result.get("title") or f"Douyin Video {video_id}"

            # 3. Construct result
            return AnalyzeResult(
                type="single",
                platform="douyin",
                id=video_id,
                title=title,
                url=url,
                direct_src=direct_url,
                extra_info={
                    'video_id': video_id,
                    'platform': 'douyin'
                }
            )
        finally:
            # Always stop the browser to free memory
            await browser_service.stop()
    
    def _extract_video_id(self, url: str) -> Optional[str]:
        """从 URL 中提取视频 ID"""
        # modal_id 格式
        modal_match = re.search(r'modal_id=(\d+)', url)
        if modal_match:
            return modal_match.group(1)
        
        # /video/ID 格式
        video_match = re.search(r'/video/(\d+)', url)
        if video_match:
            return video_match.group(1)
        
        # /note/ID 格式 (图文)
        note_match = re.search(r'/note/(\d+)', url)
        if note_match:
            return note_match.group(1)
        
        return None

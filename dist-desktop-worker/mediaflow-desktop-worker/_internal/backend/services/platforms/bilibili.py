import re
import httpx
from typing import Optional, Union, List
from loguru import logger
from backend.services.platforms.base import BasePlatform
from backend.models.schemas import AnalyzeResult, PlaylistItem

class BilibiliPlatform(BasePlatform):
    """
    Custom handler for Bilibili to support Multi-Part (分P) videos as Playlists.
    """
    
    # Regex to match Bilibili Video IDs (BV/av)
    # BV: BV1xx411c7X7
    # av: av170001
    BV_PATTERN = re.compile(r'(BV[a-zA-Z0-9]{10})|(av\d+)')

    async def match(self, url: str) -> bool:
        return "bilibili.com/video/" in url

    async def analyze(self, url: str) -> Optional[AnalyzeResult]:
        try:
            bvid = self._extract_bvid(url)
            if not bvid:
                return None

            # Fetch video details from Bilibili API
            # API Ref: https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/info.md
            api_url = "https://api.bilibili.com/x/web-interface/view"
            params = {"bvid": bvid} if bvid.startswith("BV") else {"aid": bvid[2:]}
            
            async with httpx.AsyncClient() as client:
                resp = await client.get(api_url, params=params, headers={"User-Agent": "Mozilla/5.0"})
                data = resp.json()

            if data["code"] != 0:
                logger.warning(f"Bilibili API Error: {data['message']}")
                return None

            return self._parse_api_response(url, data)

        except Exception as e:
            logger.error(f"Bilibili Platform Analysis Failed: {e}")
            return None

    def _parse_api_response(self, url: str, data: dict) -> Optional[AnalyzeResult]:
        """
        Parse Bilibili API response (extracted for testability).
        Raises KeyError/ValueError if critical fields are missing.
        """
        video_data = data["data"]
        pages = video_data.get("pages", [])

        # logic:
        # 1. Check for UGC Season (Collection/List) - "合集"
        if "ugc_season" in video_data:
            collection_result = self._construct_collection(url, video_data)
            if collection_result:
                return collection_result

        # 2. Check for Multi-page Video (Old style) - "分P"
        if len(pages) > 1:
            return self._construct_playlist(url, video_data, pages)
        
        return None # Fallback to yt-dlp for single video

    def _extract_bvid(self, url: str) -> Optional[str]:
        match = self.BV_PATTERN.search(url)
        if match:
            return match.group(0)
        return None

    def _construct_collection(self, original_url: str, video_data: dict) -> Optional[AnalyzeResult]:
        ugc_season = video_data.get("ugc_season")
        if not ugc_season:
            return None
        
        season_title = ugc_season.get("title", video_data["title"])
        sections = ugc_season.get("sections", [])
        if not sections:
            return None

        items = []
        index = 1
        
        # UGC Season can have multiple sections
        for section in sections:
            episodes = section.get("episodes", [])
            for episode in episodes:
                ep_bvid = episode.get("bvid")
                ep_title = episode.get("title")
                
                # arc contains details
                arc = episode.get("arc", {})
                duration = arc.get("duration")
                # pic = arc.get("pic")
                
                entry_url = f"https://www.bilibili.com/video/{ep_bvid}"
                
                items.append(PlaylistItem(
                    index=index,
                    title=ep_title,
                    url=entry_url,
                    duration=duration,
                    uploader=video_data["owner"]["name"] 
                ))
                index += 1

        if not items:
            return None

        return AnalyzeResult(
            type="playlist",
            title=season_title + f" (合集共{len(items)}集)",
            url=original_url,
            webpage_url=original_url,
            items=items,
            count=len(items),
            uploader=video_data["owner"]["name"],
            thumbnail=video_data["pic"]
        )

    def _construct_playlist(self, original_url: str, video_data: dict, pages: List[dict]) -> AnalyzeResult:
        bvid = video_data["bvid"]
        base_title = video_data["title"]
        owner_name = video_data["owner"]["name"]
        
        items = []
        for i, page in enumerate(pages):
            # Construct URL for specific page: ?p=X
            page_num = page["page"]
            part_title = page["part"]
            duration = page["duration"]
            
            entry_url = f"https://www.bilibili.com/video/{bvid}?p={page_num}"
            
            items.append(PlaylistItem(
                index=i + 1,
                title=f"P{page_num} - {part_title}",
                url=entry_url,
                duration=duration,
                uploader=owner_name
            ))

        return AnalyzeResult(
            type="playlist",
            title=base_title + f" (分P共{len(pages)}P)",
            url=original_url,
            webpage_url=original_url,
            items=items,
            count=len(items),
            uploader=owner_name,
            thumbnail=video_data["pic"]
        )

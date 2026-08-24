from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from backend.models.download_contracts import AnalyzeResult
from backend.services.platforms.base import BasePlatform


_EPISODE_PATH = re.compile(r"^/episode/([0-9a-fA-F]{24})/?$")
_SUPPORTED_HOSTS = {"xiaoyuzhoufm.com", "www.xiaoyuzhoufm.com"}
_MAX_PAGE_BYTES = 4 * 1024 * 1024


class _EpisodePageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.metadata: dict[str, str] = {}
        self.next_data_parts: list[str] = []
        self._inside_next_data = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): value or "" for name, value in attrs}
        if tag.lower() == "meta":
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key and content:
                self.metadata[key.lower()] = content.strip()
        elif tag.lower() == "script" and values.get("id") == "__NEXT_DATA__":
            self._inside_next_data = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._inside_next_data:
            self._inside_next_data = False

    def handle_data(self, data: str) -> None:
        if self._inside_next_data:
            self.next_data_parts.append(data)


class XiaoyuzhouPlatform(BasePlatform):
    """Resolve public Xiaoyuzhou episode pages to their original audio files."""

    async def match(self, url: str) -> bool:
        return self._episode_id(url) is not None

    async def analyze(self, url: str) -> AnalyzeResult:
        episode_id = self._episode_id(url)
        if not episode_id:
            raise ValueError("仅支持小宇宙公开单集链接（xiaoyuzhoufm.com/episode/...）")

        source_url = self._canonical_url(url)
        html = await self._fetch_html(source_url)
        parser = _EpisodePageParser()
        parser.feed(html)

        episode = self._episode_from_next_data(parser.next_data_parts)
        audio_url = (
            self._audio_url(episode)
            or parser.metadata.get("og:audio")
            or parser.metadata.get("og:audio:secure_url")
        )
        if not self._is_http_url(audio_url):
            raise ValueError("没有在该页面找到可下载的公开音频，节目可能已下架或需要登录/付费")

        episode_title = self._string(episode.get("title")) or parser.metadata.get("og:title")
        podcast = episode.get("podcast") if isinstance(episode.get("podcast"), dict) else {}
        podcast_title = self._string(podcast.get("title"))
        title = self._display_title(podcast_title, episode_title, episode_id)
        thumbnail = (
            self._nested_string(podcast, "image", "picUrl")
            or self._nested_string(episode, "image", "picUrl")
            or parser.metadata.get("og:image")
        )
        duration = self._number(episode.get("duration"))
        suggested_filename = f"{title} [{episode_id}]"

        return AnalyzeResult(
            type="single",
            platform="xiaoyuzhou",
            id=episode_id,
            title=title,
            url=source_url,
            direct_src=audio_url,
            thumbnail=thumbnail,
            duration=duration,
            uploader=podcast_title,
            webpage_url=source_url,
            media_kind="audio",
            suggested_filename=suggested_filename,
            extra_info={"episode_id": episode_id},
        )

    async def _fetch_html(self, url: str) -> str:
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        }
        timeout = httpx.Timeout(15.0, connect=8.0)
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            headers=headers,
        ) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ValueError(f"无法读取小宇宙节目页面：{exc}") from exc
            if len(response.content) > _MAX_PAGE_BYTES:
                raise ValueError("小宇宙节目页面异常过大，已停止解析")
            return response.text

    @staticmethod
    def _episode_from_next_data(parts: list[str]) -> dict[str, Any]:
        if not parts:
            return {}
        try:
            payload = json.loads("".join(parts))
        except (json.JSONDecodeError, TypeError):
            return {}
        if not isinstance(payload, dict):
            return {}
        props = payload.get("props")
        if not isinstance(props, dict):
            return {}
        page_props = props.get("pageProps")
        if not isinstance(page_props, dict):
            return {}
        episode = page_props.get("episode")
        return episode if isinstance(episode, dict) else {}

    @classmethod
    def _audio_url(cls, episode: dict[str, Any]) -> str | None:
        candidates = (
            cls._nested_string(episode, "enclosure", "url"),
            cls._nested_string(episode, "media", "source", "url"),
            cls._string(episode.get("audioUrl")),
        )
        return next((value for value in candidates if cls._is_http_url(value)), None)

    @staticmethod
    def _display_title(
        podcast_title: str | None,
        episode_title: str | None,
        episode_id: str,
    ) -> str:
        if podcast_title and episode_title and podcast_title != episode_title:
            return f"{podcast_title} - {episode_title}"
        return episode_title or podcast_title or f"小宇宙播客 {episode_id}"

    @staticmethod
    def _canonical_url(url: str) -> str:
        parsed = urlsplit(url)
        scheme = "https"
        host = (parsed.hostname or "www.xiaoyuzhoufm.com").lower()
        return urlunsplit((scheme, host, parsed.path.rstrip("/"), "", ""))

    @staticmethod
    def _episode_id(url: str) -> str | None:
        try:
            parsed = urlsplit(str(url).strip())
        except ValueError:
            return None
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or host not in _SUPPORTED_HOSTS:
            return None
        match = _EPISODE_PATH.fullmatch(parsed.path)
        return match.group(1).lower() if match else None

    @staticmethod
    def _nested_string(value: dict[str, Any], *path: str) -> str | None:
        current: Any = value
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return XiaoyuzhouPlatform._string(current)

    @staticmethod
    def _string(value: Any) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    @staticmethod
    def _number(value: Any) -> float | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return None

    @staticmethod
    def _is_http_url(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        try:
            parsed = urlsplit(value)
        except ValueError:
            return False
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)

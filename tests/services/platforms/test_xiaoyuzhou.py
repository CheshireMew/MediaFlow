import json
from unittest.mock import AsyncMock

import pytest

from backend.services.platforms.factory import create_default_platform_factory
from backend.services.platforms.xiaoyuzhou import XiaoyuzhouPlatform


EPISODE_ID = "6966f416109824f9e15f3cb5"
EPISODE_URL = f"https://www.xiaoyuzhoufm.com/episode/{EPISODE_ID}"


def episode_html(*, include_next_data: bool = True) -> str:
    episode = {
        "title": "开场白",
        "duration": 89,
        "enclosure": {"url": "https://media.xyzcdn.net/episode.m4a"},
        "podcast": {
            "title": "嘿，你好，生活",
            "image": {"picUrl": "https://image.xyzcdn.net/podcast.jpg"},
        },
    }
    next_data = (
        f'<script id="__NEXT_DATA__" type="application/json">'
        f'{json.dumps({"props": {"pageProps": {"episode": episode}}}, ensure_ascii=False)}'
        "</script>"
        if include_next_data
        else ""
    )
    return f"""
    <html><head>
      <meta property="og:title" content="开场白">
      <meta property="og:audio" content="https://media.xyzcdn.net/fallback.m4a">
      <meta property="og:image" content="https://image.xyzcdn.net/fallback.jpg">
      {next_data}
    </head></html>
    """


@pytest.mark.asyncio
async def test_matches_only_public_episode_urls():
    platform = XiaoyuzhouPlatform()

    assert await platform.match(EPISODE_URL)
    assert await platform.match(f"https://xiaoyuzhoufm.com/episode/{EPISODE_ID}/?from=share")
    assert not await platform.match("https://www.xiaoyuzhoufm.com/podcast/123")
    assert not await platform.match(
        f"https://xiaoyuzhoufm.com.example.com/episode/{EPISODE_ID}"
    )


@pytest.mark.asyncio
async def test_analyze_reads_structured_episode_metadata():
    platform = XiaoyuzhouPlatform()
    platform._fetch_html = AsyncMock(return_value=episode_html())

    result = await platform.analyze(f"{EPISODE_URL}/?from=share")

    assert result.platform == "xiaoyuzhou"
    assert result.id == EPISODE_ID
    assert result.type == "single"
    assert result.media_kind == "audio"
    assert result.title == "嘿，你好，生活 - 开场白"
    assert result.direct_src == "https://media.xyzcdn.net/episode.m4a"
    assert result.duration == 89
    assert result.thumbnail == "https://image.xyzcdn.net/podcast.jpg"
    assert result.uploader == "嘿，你好，生活"
    assert result.url == EPISODE_URL
    assert result.suggested_filename == f"嘿，你好，生活 - 开场白 [{EPISODE_ID}]"


@pytest.mark.asyncio
async def test_analyze_falls_back_to_open_graph_audio():
    platform = XiaoyuzhouPlatform()
    platform._fetch_html = AsyncMock(return_value=episode_html(include_next_data=False))

    result = await platform.analyze(EPISODE_URL)

    assert result.title == "开场白"
    assert result.direct_src == "https://media.xyzcdn.net/fallback.m4a"
    assert result.thumbnail == "https://image.xyzcdn.net/fallback.jpg"
    assert result.media_kind == "audio"


@pytest.mark.asyncio
async def test_analyze_explains_when_public_audio_is_missing():
    platform = XiaoyuzhouPlatform()
    platform._fetch_html = AsyncMock(return_value="<html><head></head></html>")

    with pytest.raises(ValueError, match="没有在该页面找到可下载的公开音频"):
        await platform.analyze(EPISODE_URL)


@pytest.mark.asyncio
async def test_default_factory_registers_xiaoyuzhou_handler():
    factory = create_default_platform_factory(object(), object())

    handler = await factory.get_handler(EPISODE_URL)

    assert isinstance(handler, XiaoyuzhouPlatform)

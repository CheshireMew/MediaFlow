import pytest
from unittest.mock import patch

from backend.services.analyzer import AnalyzerService
from backend.services.cookie_manager import CookieManager
from backend.services.download_errors import DownloadExtractionError
from backend.services.platforms.factory import PlatformFactory


def make_analyzer() -> AnalyzerService:
    return AnalyzerService(
        platform_factory=PlatformFactory(),
        cookie_manager=CookieManager(),
    )

@pytest.mark.asyncio
async def test_analyze_single_video():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        analyzer_service = make_analyzer()
        mock_ydl = mock_ydl_cls.return_value.__enter__.return_value
        mock_ydl.extract_info.return_value = {
            "_type": "video",
            "title": "Test Video",
            "duration": 60,
            "thumbnail": "http://thumb.jpg",
            "uploader": "Tester",
            "webpage_url": "http://example.com/video"
        }
        
        result = await analyzer_service.analyze("http://example.com/video")
        
        assert result.type == "single"
        assert result.title == "Test Video"
        assert result.duration == 60
        assert result.count is None

@pytest.mark.asyncio
async def test_analyze_playlist():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        analyzer_service = make_analyzer()
        mock_ydl = mock_ydl_cls.return_value.__enter__.return_value
        mock_ydl.extract_info.return_value = {
            "_type": "playlist",
            "title": "Test Playlist",
            "entries": [
                {"title": "V1", "url": "u1", "duration": 10},
                {"title": "V2", "url": "u2", "duration": 20}
            ],
            "webpage_url": "http://example.com/playlist"
        }
        
        result = await analyzer_service.analyze("http://example.com/playlist")
        
        assert result.type == "playlist"
        assert result.title == "Test Playlist"
        assert result.count == 2
        assert len(result.items) == 2
        assert result.items[0].title == "V1"


@pytest.mark.asyncio
async def test_analyze_preserves_upstream_title_without_guessing_encoding():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        analyzer_service = make_analyzer()
        mock_ydl = mock_ydl_cls.return_value.__enter__.return_value
        mock_ydl.extract_info.return_value = {
            "_type": "video",
            "title": "Patient Investor - 鈥淲on鈥檛 Replace",
            "duration": 60,
            "thumbnail": "http://thumb.jpg",
            "uploader": "Tester",
            "webpage_url": "http://example.com/video",
        }

        result = await analyzer_service.analyze("http://example.com/video")

        assert result.title == "Patient Investor - 鈥淲on鈥檛 Replace"


@pytest.mark.asyncio
async def test_analyze_surfaces_classified_ytdlp_error():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        analyzer_service = make_analyzer()
        mock_ydl = mock_ydl_cls.return_value.__enter__.return_value
        mock_ydl.extract_info.side_effect = Exception(
            "ERROR: [twitter] 2005220639771161077: Error(s) while querying API: Bad guest token; please report this issue"
        )

        with pytest.raises(DownloadExtractionError) as exc_info:
            await analyzer_service.analyze(
                "https://x.com/example/status/2005220639771161077"
            )

        assert exc_info.value.error.code == "twitter_guest_token"
        assert "X/Twitter 游客访问失败" in str(exc_info.value)


@pytest.mark.asyncio
async def test_analyze_classifies_captured_ytdlp_error_when_info_is_none():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        analyzer_service = make_analyzer()
        mock_ydl = mock_ydl_cls.return_value.__enter__.return_value

        def extract_info(_url, download=False):
            ydl_opts = mock_ydl_cls.call_args.args[0]
            ydl_opts["logger"].error(
                "ERROR: [twitter] 2005220639771161077: Error(s) while querying API: Bad guest token"
            )
            return None

        mock_ydl.extract_info.side_effect = extract_info

        with pytest.raises(DownloadExtractionError) as exc_info:
            await analyzer_service.analyze(
                "https://twitter.com/example/status/2005220639771161077"
            )

        assert exc_info.value.error.code == "twitter_guest_token"

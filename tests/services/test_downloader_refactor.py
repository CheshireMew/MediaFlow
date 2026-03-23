import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from backend.services.downloader.service import DownloaderService
from backend.services.cookie_manager import CookieManager
from backend.services.platforms.base import BasePlatform
from backend.services.platforms.factory import PlatformFactory
from backend.models.schemas import AnalyzeResult, TaskResult, FileRef


def make_downloader() -> DownloaderService:
    return DownloaderService(
        platform_factory=PlatformFactory(),
        cookie_manager=CookieManager(),
    )


@pytest.mark.asyncio
async def test_download_uses_strategy():
    downloader_service = make_downloader()
    # Mock PlatformFactory
    with patch("backend.services.platforms.factory.PlatformFactory.get_handler", new_callable=AsyncMock) as mock_get_handler:
        # Mock a handler
        mock_handler = AsyncMock(spec=BasePlatform)
        mock_handler.analyze.return_value = AnalyzeResult(
            type="single",
            platform="mock",
            id="123",
            title="Mock Video",
            url="http://original.url",
            direct_src="http://direct.url",
            extra_info={}
        )
        mock_get_handler.return_value = mock_handler

        # Mock run_in_executor to avoid actual download
        with patch("asyncio.get_running_loop") as mock_get_loop:
            mock_loop = MagicMock()
            mock_get_loop.return_value = mock_loop
            
            # Setup run_in_executor to return immediate result
            expected_asset = TaskResult(
                success=True,
                files=[FileRef(type="video", path="/tmp/Mock Video.mp4", label="source")],
                meta={"id": "task1", "filename": "Mock Video.mp4", "duration": 100, "title": "Mock Video"}
            )
            mock_loop.run_in_executor = AsyncMock(return_value=expected_asset)

            # Call download
            result = await downloader_service.download("http://example.com/video", task_id="task1")

            # Verify Strategy Used
            mock_get_handler.assert_called_once_with("http://example.com/video")
            mock_handler.analyze.assert_called_once_with("http://example.com/video")
            
            # Verify Executor Called
            assert mock_loop.run_in_executor.called
            
            # Verify Result
            assert result == expected_asset

@pytest.mark.asyncio
async def test_download_fallback_when_no_handler():
    downloader_service = make_downloader()
    with patch("backend.services.platforms.factory.PlatformFactory.get_handler", new_callable=AsyncMock) as mock_get_handler:
        mock_get_handler.return_value = None # No handler

        with patch("asyncio.get_running_loop") as mock_get_loop:
            mock_loop = MagicMock()
            mock_get_loop.return_value = mock_loop
            
            expected_asset = TaskResult(
                success=True,
                files=[FileRef(type="video", path="path", label="source")],
                meta={"id": "task2", "filename": "file.mp4", "duration": 10, "title": "Title"}
            )
            mock_loop.run_in_executor = AsyncMock(return_value=expected_asset)

            await downloader_service.download("http://generic.com/video", task_id="task2")

            mock_get_handler.assert_called_once()
            # Verify executor called with original URL
            assert mock_loop.run_in_executor.called

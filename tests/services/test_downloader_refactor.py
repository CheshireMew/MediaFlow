import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from backend.services.downloader.service import DownloaderService
from backend.services.cookie_manager import CookieManager
from backend.services.platforms.base import BasePlatform
from backend.services.platforms.factory import PlatformFactory
from backend.models.download_contracts import AnalyzeResult
from backend.models.media_contracts import MediaReference, TaskArtifact, TaskResult
from backend.models.task_result_contracts import DownloadOutput, PipelineOutputs


def video_artifact(path: str) -> TaskArtifact:
    return TaskArtifact(
        kind="video",
        role="output",
        ref=MediaReference(
            path=path,
            name=path.rsplit("/", 1)[-1],
            media_kind="video",
            role="output",
        ),
    )


def make_downloader() -> DownloaderService:
    return DownloaderService(
        platform_factory=PlatformFactory(),
        cookie_manager=CookieManager(),
    )


def download_result(task_id: str, path: str, duration: float, title: str) -> TaskResult:
    return TaskResult(
        success=True,
        artifacts=[video_artifact(path)],
        outputs=PipelineOutputs(
            download=DownloadOutput(
                id=task_id,
                filename=path.rsplit("/", 1)[-1],
                duration=duration,
                title=title,
                source_url="http://example.com/video",
            )
        ),
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
            expected_asset = download_result(
                "task1", "/tmp/Mock Video.mp4", 100, "Mock Video"
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
            
            expected_asset = download_result("task2", "file.mp4", 10, "Title")
            mock_loop.run_in_executor = AsyncMock(return_value=expected_asset)

            await downloader_service.download("http://generic.com/video", task_id="task2")

            mock_get_handler.assert_called_once()
            # Verify executor called with original URL
            assert mock_loop.run_in_executor.called


@pytest.mark.asyncio
async def test_download_normalizes_x_pro_url_before_sync_download():
    downloader_service = make_downloader()
    expected_asset = download_result("task3", "file.mp4", 10, "Title")

    with (
        patch(
            "backend.services.platforms.factory.PlatformFactory.get_handler",
            new_callable=AsyncMock,
            return_value=None,
        ) as mock_get_handler,
        patch.object(
            downloader_service,
            "_perform_download_sync",
            return_value=expected_asset,
        ) as mock_sync_download,
        patch("asyncio.get_running_loop") as mock_get_loop,
    ):
        mock_loop = MagicMock()
        mock_get_loop.return_value = mock_loop
        mock_loop.run_in_executor = AsyncMock(
            side_effect=lambda _executor, callback: callback()
        )

        result = await downloader_service.download(
            "https://pro.x.com/jawwwn_/status/2062587453463007642/video/1",
            task_id="task3",
        )

    normalized_url = "https://x.com/jawwwn_/status/2062587453463007642/video/1"
    assert result == expected_asset
    mock_get_handler.assert_called_once_with(normalized_url)
    mock_sync_download.assert_called_once()
    assert mock_sync_download.call_args.kwargs["url"] == normalized_url
    assert mock_sync_download.call_args.kwargs["start_url"] == normalized_url


def test_download_retries_retryable_ytdlp_network_failure():
    downloader_service = make_downloader()

    with (
        patch.object(
            downloader_service,
            "_execute_yt_dlp_download",
            side_effect=[
                Exception("EOF occurred in violation of protocol (_ssl.c:1007)"),
                ({"title": "Recovered"}, "D:/out.mp4"),
            ],
        ) as mock_execute,
        patch("backend.services.downloader.service.time.sleep") as mock_sleep,
    ):
        result = downloader_service._execute_yt_dlp_download_with_retry(
            url="https://x.com/i/status/1",
            ydl_opts={},
            require_prepared_path=True,
            classify_url="https://x.com/i/status/1",
            operation_name="media download",
        )

    assert result == ({"title": "Recovered"}, "D:/out.mp4")
    assert mock_execute.call_count == 2
    mock_sleep.assert_called_once_with(1)


def test_download_does_not_retry_unknown_ytdlp_failure():
    downloader_service = make_downloader()

    with (
        patch.object(
            downloader_service,
            "_execute_yt_dlp_download",
            side_effect=Exception("Task cancelled by user"),
        ) as mock_execute,
        patch("backend.services.downloader.service.time.sleep") as mock_sleep,
        pytest.raises(Exception, match="Task cancelled by user"),
    ):
        downloader_service._execute_yt_dlp_download_with_retry(
            url="https://example.com/video",
            ydl_opts={},
            require_prepared_path=True,
            classify_url="https://example.com/video",
            operation_name="media download",
        )

    assert mock_execute.call_count == 1
    mock_sleep.assert_not_called()

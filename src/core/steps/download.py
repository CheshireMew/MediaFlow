import asyncio
from loguru import logger

from src.core.steps.base import PipelineStep
from src.core.steps.registry import StepRegistry
from src.core.context import PipelineContext
from src.core.container import container, Services


def _get_downloader():
    return container.get(Services.DOWNLOADER)


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


class DownloadStep(PipelineStep):
    @property
    def name(self) -> str:
        return "download"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        url = params.get("url")
        if not url:
            raise ValueError("Download step requires 'url' param")
        
        loop = asyncio.get_running_loop()
        tm = _get_task_manager()
        
        # Callbacks for sync code
        def progress_cb(percent, msg):
            if task_id:
                asyncio.run_coroutine_threadsafe(
                    tm.update_task(task_id, progress=percent, message=msg),
                    loop
                )

        def check_cancel_cb():
            return task_id and tm.is_cancelled(task_id)

        # Run download async (it handles thread pool internally)
        downloader = _get_downloader()
        result = await downloader.download(
            url, 
            proxy=params.get("proxy"),
            playlist_title=params.get("playlist_title"),
            progress_callback=progress_cb,
            check_cancel_callback=check_cancel_cb,
            download_subs=params.get("download_subs", False),
            resolution=params.get("resolution", "best"),
            task_id=task_id,
            cookie_file=params.get("cookie_file"),
            filename=params.get("filename"),
            codec=params.get("codec", "best")
        )
        
        if not result.success:
            raise Exception(result.error or "Download failed with unknown error")

        # Find video file
        video_file = next((f for f in result.files if f.type == "video"), None)
        if not video_file:
            raise Exception("Download succeeded but no video file was returned")

        # Store result in context
        ctx.set("video_path", video_file.path)
        ctx.set("media_filename", result.meta.get("filename", "unknown.mp4"))
        ctx.set("title", result.meta.get("title", "Unknown"))
        
        # Check for subtitles
        subtitle_file = next((f for f in result.files if f.type == "subtitle"), None)
        if subtitle_file:
            ctx.set("subtitle_path", subtitle_file.path)
            
        logger.success(f"Step Download finished. Path: {video_file.path}")


# Register at module level
StepRegistry.register(DownloadStep())

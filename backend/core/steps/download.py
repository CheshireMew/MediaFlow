import asyncio
from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.steps.registry import StepRegistry
from backend.core.context import PipelineContext
from backend.core.container import container, Services


class DownloadStep(PipelineStep):
    @property
    def name(self) -> str:
        return "download"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        url = params.get("url")
        if not url:
            raise ValueError("Download step requires 'url' param")
        
        loop = asyncio.get_running_loop()
        tm = container.get(Services.TASK_MANAGER)
        
        # Callbacks for sync code
        def progress_cb(percent, msg):
            if task_id:
                tm.raise_if_control_requested(task_id)
                tm.submit_threadsafe_update(
                    loop,
                    task_id,
                    progress=percent,
                    message=msg,
                )

        def check_cancel_cb():
            if task_id:
                return tm.has_stop_request(task_id)
            return False

        # Run download async (it handles thread pool internally)
        downloader = container.get(Services.DOWNLOADER)
        result = await downloader.download(
            url, 
            proxy=params.get("proxy"),
            output_dir=params.get("output_dir"),
            playlist_title=params.get("playlist_title"),
            playlist_items=params.get("playlist_items"),
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
            if task_id:
                tm.raise_if_control_requested(task_id)
            raise Exception(result.error or "Download failed with unknown error")

        media_file = next(
            (f for f in result.files if f.type in {"video", "audio"}),
            None,
        )
        if not media_file:
            raise Exception("Download succeeded but no media file was returned")

        # Store result in context
        if media_file.type == "audio":
            ctx.set_media(
                path_key="audio_path",
                ref_key="audio_ref",
                path=media_file.path,
                media_type="audio/mpeg",
            )
        else:
            ctx.set_media(
                path_key="video_path",
                ref_key="video_ref",
                path=media_file.path,
                media_type="video/mp4",
                extra_ref_keys=("output_ref",),
            )
        ctx.set("media_filename", result.meta.get("filename", "unknown.mp4"))
        ctx.set("title", result.meta.get("title", "Unknown"))
        
        # Check for subtitles
        subtitle_file = next((f for f in result.files if f.type == "subtitle"), None)
        if subtitle_file:
            ctx.set_media(
                path_key="subtitle_path",
                ref_key="subtitle_ref",
                path=subtitle_file.path,
                media_type="application/x-subrip",
                mirror_path_keys=("srt_path",),
                extra_ref_keys=("context_ref",),
            )
            
        logger.success(f"Step Download finished. Path: {media_file.path}")


# Register at module level
StepRegistry.register(DownloadStep())

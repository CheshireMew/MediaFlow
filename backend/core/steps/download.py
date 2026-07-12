from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext


class DownloadStep(PipelineStep):
    def __init__(self, *, downloader, task_manager):
        self._downloader = downloader
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "download"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        url = params.get("url")
        if not url:
            raise ValueError("Download step requires 'url' param")
        
        runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
        tm = runtime.task_manager
        
        # Callbacks for sync code
        progress_cb = runtime.build_progress_callback()

        def check_cancel_cb():
            if task_id:
                return tm.has_stop_request(task_id)
            return False

        # Run download async (it handles thread pool internally)
        result = await self._downloader.download(
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
            runtime.checkpoint()
            raise Exception(result.error or "Download failed with unknown error")

        media_artifact = next(
            (
                artifact
                for artifact in result.artifacts
                if artifact.kind in {"video", "audio"}
            ),
            None,
        )
        if not media_artifact:
            raise Exception("Download succeeded but no media file was returned")

        if media_artifact.kind == "audio":
            ctx.set_media(
                "audio_ref",
                media_artifact.ref,
                kind="audio",
            )
        else:
            ctx.set_media(
                "video_ref",
                media_artifact.ref,
                kind="video",
            )
        ctx.set("media_filename", result.meta.get("filename", "unknown.mp4"))
        ctx.set("title", result.meta.get("title", "Unknown"))
        
        # Check for subtitles
        subtitle_artifact = next(
            (artifact for artifact in result.artifacts if artifact.kind == "subtitle"),
            None,
        )
        if subtitle_artifact:
            ctx.set_media(
                "subtitle_ref",
                subtitle_artifact.ref,
                kind="subtitle",
            )
            
        logger.success(f"Step Download finished. Path: {media_artifact.ref.path}")

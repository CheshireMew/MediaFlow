from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import ClipExportRequest


async def _clip_export_background(task_id: str, req: ClipExportRequest):
    from backend.application.clip_export_service import (
        build_clip_export_task_result,
        export_clips,
    )

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=export_clips,
        worker_kwargs={
            "video_ref": req.video_ref,
            "segments": req.segments,
            "render_mode": req.render_mode,
            "srt_ref": req.srt_ref,
            "watermark_path": req.watermark_path,
            "options": req.options,
            "output_dir": req.output_dir,
        },
        start_message="Preparing clip export...",
        success_message="Clip export completed!",
        result_transformer=build_clip_export_task_result,
    )

from backend.models.schemas import ClipExportRequest


async def _clip_export_background(
    task_id: str,
    req: ClipExportRequest,
    *,
    video_synthesis,
    background_runner,
):
    from backend.application.clip_export_service import (
        build_clip_export_task_result,
        export_clips,
    )

    await background_runner.run(
        task_id=task_id,
        worker_fn=export_clips,
        worker_kwargs={
            "video_synthesis": video_synthesis,
            "video_ref": req.video_ref,
            "segments": req.segments,
            "render_mode": req.render_mode,
            "srt_ref": req.srt_ref,
            "watermark_ref": req.watermark_ref,
            "options": req.options,
            "output_dir": req.output_dir,
        },
        start_message_code="clip_export_preparing",
        success_message_code="clip_export_completed",
        result_transformer=build_clip_export_task_result,
    )

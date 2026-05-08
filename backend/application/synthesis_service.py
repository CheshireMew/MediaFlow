from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import SynthesisRequest
from backend.services.media_refs import create_media_ref


async def _synthesis_background(task_id: str, req: SynthesisRequest):
    from loguru import logger
    import json

    logger.info(f"Synthesis Options: {json.dumps(req.options, indent=2)}")
    video_path = req.video_ref.path
    srt_path = req.srt_ref.path
    output_path = req.output_ref.path if req.output_ref else None

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=runtime_service(Services.VIDEO_SYNTHESIS).synthesize,
        worker_kwargs={
            "video_path": video_path,
            "srt_path": srt_path,
            "output_path": output_path,
            "watermark_path": req.watermark_path,
            "options": req.options,
        },
        start_message="Preparing synthesis...",
        success_message="Synthesis completed!",
        result_transformer=lambda path: {
            "success": True,
            "files": [{"type": "video", "path": path, "label": "synthesis_output"}],
            "meta": {
                "video_ref": create_media_ref(path, "video/mp4", role="output"),
                "output_ref": create_media_ref(path, "video/mp4", role="output"),
                "context_ref": req.srt_ref,
                "subtitle_ref": req.srt_ref,
                "options": req.options,
            },
        },
    )

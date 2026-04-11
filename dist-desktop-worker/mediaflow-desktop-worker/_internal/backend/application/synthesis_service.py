from backend.core.runtime_access import RuntimeServices
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import SynthesisRequest
from backend.services.media_refs import create_media_ref


async def run_synthesis_task(task_id: str, req: SynthesisRequest):
    from loguru import logger
    import json

    logger.info(f"Synthesis Options: {json.dumps(req.options, indent=2)}")

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=RuntimeServices.video_synthesizer().burn_in_subtitles,
        worker_kwargs={
            "video_path": req.video_path,
            "srt_path": req.srt_path,
            "output_path": req.output_path,
            "watermark_path": req.watermark_path,
            "options": req.options,
        },
        start_message="Preparing synthesis...",
        success_message="Synthesis completed!",
        result_transformer=lambda path: {
            "success": True,
            "files": [{"type": "video", "path": path, "label": "synthesis_output"}],
            "meta": {
                "video_path": path,
                "video_ref": create_media_ref(path, "video/mp4", role="output"),
                "output_ref": create_media_ref(path, "video/mp4", role="output"),
                "context_ref": req.srt_ref or create_media_ref(req.srt_path, "application/x-subrip", role="context"),
                "subtitle_ref": req.srt_ref or create_media_ref(req.srt_path, "application/x-subrip", role="context"),
                "options": req.options,
            },
        },
    )


def execute_synthesis(
    req: SynthesisRequest,
    *,
    progress_callback=None,
):
    final_path = RuntimeServices.video_synthesizer().burn_in_subtitles(
        video_path=req.video_path,
        srt_path=req.srt_path,
        output_path=req.output_path,
        watermark_path=req.watermark_path,
        options=req.options or {},
        progress_callback=progress_callback,
    )
    return {
        "video_path": final_path,
        "output_path": final_path,
        "video_ref": create_media_ref(final_path, "video/mp4", role="output"),
        "output_ref": create_media_ref(final_path, "video/mp4", role="output"),
        "context_ref": req.srt_ref or create_media_ref(req.srt_path, "application/x-subrip", role="context"),
        "subtitle_ref": req.srt_ref or create_media_ref(req.srt_path, "application/x-subrip", role="context"),
    }


async def submit_synthesis_task(req: SynthesisRequest) -> dict:
    from os.path import basename

    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="synthesis",
        task_name=basename(req.video_path or ""),
        request_params=req.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: run_synthesis_task(task_id, req),
    )

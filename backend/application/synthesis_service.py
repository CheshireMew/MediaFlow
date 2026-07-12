from backend.models.schemas import SynthesisRequest, TaskArtifact, TaskResult
from backend.services.media_refs import create_media_ref


def build_synthesis_task_result(path: str, options: dict | None) -> dict:
    return TaskResult(
        success=True,
        artifacts=[
            TaskArtifact(
                kind="video",
                role="output",
                ref=create_media_ref(path, "video/mp4", role="output"),
            )
        ],
        meta={"options": options or {}},
    ).model_dump(mode="json")


async def _synthesis_background(
    task_id: str,
    req: SynthesisRequest,
    *,
    video_synthesis,
    background_runner,
):
    from loguru import logger

    logger.info(
        "Synthesis request: option_fields={}, has_subtitles={}, "
        "has_output={}, has_watermark={}",
        sorted((req.options or {}).keys()),
        req.srt_ref is not None,
        req.output_ref is not None,
        req.watermark_ref is not None,
    )
    video_path = req.video_ref.path
    srt_path = req.srt_ref.path if req.srt_ref else None
    output_path = req.output_ref.path if req.output_ref else None

    await background_runner.run(
        task_id=task_id,
        worker_fn=video_synthesis.synthesize,
        worker_kwargs={
            "video_path": video_path,
            "srt_path": srt_path,
            "output_path": output_path,
            "watermark_path": req.watermark_ref.path if req.watermark_ref else None,
            "options": req.options,
        },
        start_message_code="synthesis_preparing",
        success_message_code="synthesis_completed",
        result_transformer=lambda path: build_synthesis_task_result(path, req.options),
    )

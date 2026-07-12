import asyncio
import os
from loguru import logger

from backend.core.task_runtime import TaskRuntimeContext
from backend.models.schemas import OCRExtractRequest, TaskArtifact, TaskResult
from backend.services.media_refs import create_media_ref


def load_ocr_results(video_path: str) -> dict[str, list]:
    base_path, _ = os.path.splitext(video_path)
    json_path = f"{base_path}.ocr.json"

    if not os.path.exists(json_path):
        return {"events": []}

    try:
        import json

        with open(json_path, "r", encoding="utf-8") as file:
            events = json.load(file)
        return {"events": events}
    except Exception as exc:
        logger.error(f"Failed to load OCR results from {json_path}: {exc}")
        return {"events": []}


async def _ocr_background(task_id: str, request: OCRExtractRequest, *, task_manager):
    from backend.services.ocr.engine_provider import get_ocr_engine

    runtime = TaskRuntimeContext(task_id, task_manager=task_manager)
    video_path = request.video_ref.path
    try:
        runtime.checkpoint()
        engine = get_ocr_engine(request.engine)

        if request.engine != "paddle" and not engine.ocr:
            await runtime.update(
                status="running",
                cancelled=False,
                message_code="ocr_models_initializing",
                message_params={},
                progress=0,
            )

            def download_bridge(p, message_code, message_params=None):
                runtime.submit_progress(
                    round(p * 20, 1),
                    message_code,
                    message_params,
                )

            await asyncio.to_thread(engine.initialize_models, download_bridge)

        await runtime.update(
            status="running",
            cancelled=False,
            message_code="ocr_extraction_starting",
            message_params={},
            progress=0,
        )

        from backend.services.ocr.pipeline import VideoOCRPipeline

        pipeline = VideoOCRPipeline(engine)
        roi_tuple = tuple(request.roi) if request.roi and len(request.roi) == 4 else None

        import time
        last_update = 0

        def progress_bridge(p, message_code, message_params=None):
            nonlocal last_update
            runtime.checkpoint()
            now = time.time()
            if now - last_update > 0.5 or p >= 1.0:
                runtime.submit_progress(
                    round(p * 100, 1),
                    message_code,
                    message_params,
                )
                last_update = now

        events = await asyncio.to_thread(
            pipeline.process_video,
            video_path=video_path,
            roi=roi_tuple,
            sample_rate=request.sample_rate,
            progress_callback=progress_bridge,
        )

        import json

        base_path, _ = os.path.splitext(video_path)
        json_path = f"{base_path}.ocr.json"
        srt_path = f"{base_path}.ocr.srt"

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump([e.model_dump() for e in events], f, ensure_ascii=False, indent=2)

        def format_time(seconds):
            millis = int((seconds - int(seconds)) * 1000)
            seconds = int(seconds)
            mins, secs = divmod(seconds, 60)
            hrs, mins = divmod(mins, 60)
            return f"{hrs:02}:{mins:02}:{secs:02},{millis:03}"

        with open(srt_path, "w", encoding="utf-8") as f:
            for idx, event in enumerate(events, 1):
                start = format_time(event.start)
                end = format_time(event.end)
                text = event.text.replace("\n", " ")
                f.write(f"{idx}\n{start} --> {end}\n{text}\n\n")

        logger.info(f"Saved OCR results to {json_path} and {srt_path}")

        json_ref = create_media_ref(json_path, "application/json", role="output")
        srt_ref = create_media_ref(
            srt_path,
            "application/x-subrip",
            role="output",
        )
        await runtime.update(
            status="completed",
            cancelled=False,
            progress=100,
            message_code="ocr_completed",
            message_params={},
            result=TaskResult(
                success=True,
                artifacts=[
                    TaskArtifact(kind="file", role="output", ref=json_ref),
                    TaskArtifact(kind="subtitle", role="output", ref=srt_ref),
                ],
                meta={"events": [e.model_dump() for e in events]},
            ).model_dump(mode="json"),
        )
    except Exception as e:
        request_type = runtime.get_stop_request()
        if request_type in {"pause", "cancel"}:
            await runtime.mark_controlled_stop(
                request_type,
                "paused" if request_type == "pause" else "cancelled",
                {},
            )
            return
        logger.error(f"OCR Task failed: {e}")
        await runtime.update(
            status="failed",
            message_code="failed",
            message_params={},
            error=str(e),
        )

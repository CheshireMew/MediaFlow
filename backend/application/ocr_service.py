import asyncio
import os
from loguru import logger

from backend.core.runtime_access import RuntimeServices, TaskRuntimeContext
from backend.models.schemas import OCRExtractRequest

_rapid_ocr_engine = None
_paddle_ocr_engine = None


def get_ocr_engine(engine_type: str = "rapid"):
    global _rapid_ocr_engine, _paddle_ocr_engine

    if engine_type == "paddle":
        if _paddle_ocr_engine is None:
            from backend.services.ocr.ocr_engine import PaddleOCREngine

            _paddle_ocr_engine = PaddleOCREngine()
        return _paddle_ocr_engine

    if _rapid_ocr_engine is None:
        from backend.services.ocr.ocr_engine import RapidOCREngine

        _rapid_ocr_engine = RapidOCREngine()
    return _rapid_ocr_engine


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


async def run_ocr_task(task_id: str, request: OCRExtractRequest):
    runtime = TaskRuntimeContext.for_task(task_id)
    try:
        runtime.checkpoint()
        engine = get_ocr_engine(request.engine)

        if request.engine != "paddle" and not engine.ocr:
            await runtime.update(
                status="running",
                cancelled=False,
                message="Initializing OCR Models...",
                progress=0,
            )

            def download_bridge(p, msg):
                runtime.submit_progress(round(p * 20, 1), msg)

            await asyncio.to_thread(engine.initialize_models, download_bridge)

        await runtime.update(
            status="running",
            cancelled=False,
            message="Starting extraction...",
            progress=0,
        )

        from backend.services.ocr.pipeline import VideoOCRPipeline

        pipeline = VideoOCRPipeline(engine)
        roi_tuple = tuple(request.roi) if request.roi and len(request.roi) == 4 else None

        import time
        last_update = 0

        def progress_bridge(p, msg):
            nonlocal last_update
            runtime.checkpoint()
            now = time.time()
            if now - last_update > 0.5 or p >= 1.0:
                runtime.submit_progress(round(p * 100, 1), msg)
                last_update = now

        events = await asyncio.to_thread(
            pipeline.process_video,
            video_path=request.video_path,
            roi=roi_tuple,
            sample_rate=request.sample_rate,
            progress_callback=progress_bridge,
        )

        import json

        base_path, _ = os.path.splitext(request.video_path)
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

        await runtime.update(
            status="completed",
            cancelled=False,
            progress=100,
            message="Extraction Complete",
            result={
                "events": [e.model_dump() for e in events],
                "files": [
                    {"type": "json", "path": json_path},
                    {"type": "srt", "path": srt_path},
                ],
            },
        )
    except Exception as e:
        request_type = runtime.get_stop_request()
        if request_type in {"pause", "cancel"}:
            await runtime.mark_controlled_stop(request_type, str(e))
            return
        logger.error(f"OCR Task failed: {e}")
        await runtime.update(status="failed", error=str(e))


async def submit_ocr_task(request: OCRExtractRequest) -> dict:
    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="extract",
        task_name="OCR Extraction",
        request_params=request.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: run_ocr_task(task_id, request),
    )


def execute_ocr(
    request: OCRExtractRequest,
    *,
    progress_callback,
):
    from backend.services.ocr.pipeline import VideoOCRPipeline

    engine = get_ocr_engine(request.engine)
    if request.engine != "paddle" and getattr(engine, "ocr", None) is None:
        def init_progress(progress: float, message: str) -> None:
            progress_callback(round(progress * 20, 1), message)

        engine.initialize_models(init_progress)

    pipeline = VideoOCRPipeline(engine)
    roi_tuple = tuple(request.roi) if request.roi and len(request.roi) == 4 else None
    events = pipeline.process_video(
        video_path=request.video_path,
        roi=roi_tuple,
        sample_rate=request.sample_rate,
        progress_callback=progress_callback,
    )

    import json

    base_path, _ = os.path.splitext(request.video_path)
    json_path = f"{base_path}.ocr.json"
    srt_path = f"{base_path}.ocr.srt"

    with open(json_path, "w", encoding="utf-8") as file:
        json.dump([event.model_dump() for event in events], file, ensure_ascii=False, indent=2)

    def format_time(seconds: float) -> str:
        millis = int((seconds - int(seconds)) * 1000)
        seconds_int = int(seconds)
        mins, secs = divmod(seconds_int, 60)
        hrs, mins = divmod(mins, 60)
        return f"{hrs:02}:{mins:02}:{secs:02},{millis:03}"

    with open(srt_path, "w", encoding="utf-8") as file:
        for index, event in enumerate(events, 1):
            file.write(
                f"{index}\n"
                f"{format_time(event.start)} --> {format_time(event.end)}\n"
                f"{event.text.replace(chr(10), ' ')}\n\n"
            )

    return {
        "events": [event.model_dump(mode="json") for event in events],
        "files": [
            {"type": "json", "path": json_path},
            {"type": "srt", "path": srt_path},
        ],
    }

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
from backend.services.ocr.ocr_engine import RapidOCREngine, PaddleOCREngine
from backend.services.ocr.pipeline import VideoOCRPipeline, TextEvent
from loguru import logger

router = APIRouter()

# Global instances (lazy loaded or singleton)
# For now, we instantiate RapidOCR on demand or reuse. 
# RapidOCR is relatively lightweight, but loading ONNX models takes time.
# Better to have a singleton service.

_rapid_ocr_engine = None
_paddle_ocr_engine = None

def _get_ocr_engine(engine_type: str = "rapid"):
    global _rapid_ocr_engine, _paddle_ocr_engine
    
    if engine_type == "paddle":
        if _paddle_ocr_engine is None:
            _paddle_ocr_engine = PaddleOCREngine()
        return _paddle_ocr_engine
    else:
        if _rapid_ocr_engine is None:
            _rapid_ocr_engine = RapidOCREngine()
        return _rapid_ocr_engine

class OCRExtractRequest(BaseModel):
    video_path: str
    roi: Optional[List[int]] = None # [x, y, w, h]
    engine: str = "rapid" # rapid | paddle
    sample_rate: int = 2

class OCRExtractResponse(BaseModel):
    task_id: str
    status: str = "queued"
    message: str = "OCR task started"
    # events will be null initially, fetched via task result later
    events: Optional[List[TextEvent]] = None

import asyncio
from backend.core.container import container, Services


async def run_ocr_task(task_id: str, request: OCRExtractRequest):
    tm = container.get(Services.TASK_MANAGER)
    try:
        tm.raise_if_control_requested(task_id)
        engine = _get_ocr_engine(request.engine)

        if isinstance(engine, RapidOCREngine) and not engine.ocr:
            await tm.update_task(task_id, status="running", cancelled=False, message="Initializing OCR Models...", progress=0)

            loop = asyncio.get_running_loop()

            def download_bridge(p, msg):
                tm.raise_if_control_requested(task_id)
                tm.submit_threadsafe_update(
                    loop,
                    task_id,
                    progress=round(p * 20, 1),
                    message=msg,
                )

            await asyncio.to_thread(engine.initialize_models, download_bridge)

        await tm.update_task(task_id, status="running", cancelled=False, message="Starting extraction...", progress=0)

        pipeline = VideoOCRPipeline(engine)
        roi_tuple = tuple(request.roi) if request.roi and len(request.roi) == 4 else None

        loop = asyncio.get_running_loop()
        import time
        last_update = 0

        def progress_bridge(p, msg):
            nonlocal last_update
            tm.raise_if_control_requested(task_id)
            now = time.time()
            if now - last_update > 0.5 or p >= 1.0:
                tm.submit_threadsafe_update(
                    loop,
                    task_id,
                    progress=round(p * 100, 1),
                    message=msg,
                )
                last_update = now

        events = await asyncio.to_thread(
            pipeline.process_video,
            video_path=request.video_path,
            roi=roi_tuple,
            sample_rate=request.sample_rate,
            progress_callback=progress_bridge
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

        await tm.update_task(
            task_id,
            status="completed",
            cancelled=False,
            progress=100,
            message="Extraction Complete",
            result={
                "events": [e.model_dump() for e in events],
                "files": [
                    {"type": "json", "path": json_path},
                    {"type": "srt", "path": srt_path}
                ]
            }
        )
    except Exception as e:
        request_type = tm.get_stop_request(task_id)
        if request_type in {"pause", "cancel"}:
            await tm.mark_controlled_stop(task_id, request_type, str(e))
            return
        logger.error(f"OCR Task failed: {e}")
        await tm.update_task(task_id, status="failed", error=str(e))

@router.post("/extract", response_model=OCRExtractResponse)
async def extract_text(request: OCRExtractRequest):
    from backend.utils.path_validator import validate_path
    validate_path(request.video_path, "video_path")

    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
        task_type="extract",
        task_name="OCR Extraction",
        request_params={
            "video_path": request.video_path,
            "engine": request.engine,
            "roi": request.roi,
            "sample_rate": request.sample_rate,
        },
        runner_factory=lambda task_id: lambda: run_ocr_task(task_id, request),
    )
    return OCRExtractResponse(task_id=response["task_id"])


@router.get("/results")
async def get_ocr_results(video_path: str):
    """Load previously saved OCR results for a video, if any."""
    base_path, _ = os.path.splitext(video_path)
    json_path = f"{base_path}.ocr.json"

    if not os.path.exists(json_path):
        return {"events": []}

    try:
        import json
        with open(json_path, "r", encoding="utf-8") as f:
            events = json.load(f)
        return {"events": events}
    except Exception as e:
        logger.error(f"Failed to load OCR results from {json_path}: {e}")
        return {"events": []}


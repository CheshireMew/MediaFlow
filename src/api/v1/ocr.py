from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
from src.services.ocr.ocr_engine import RapidOCREngine, PaddleOCREngine
from src.services.ocr.pipeline import VideoOCRPipeline, TextEvent
from loguru import logger

router = APIRouter()

# Global instances (lazy loaded or singleton)
# For now, we instantiate RapidOCR on demand or reuse. 
# RapidOCR is relatively lightweight, but loading ONNX models takes time.
# Better to have a singleton service.

_rapid_ocr_engine = None
_paddle_ocr_engine = None

def get_ocr_engine(engine_type: str = "rapid"):
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
from src.core.container import container, Services

@router.post("/extract", response_model=OCRExtractResponse)
async def extract_text(request: OCRExtractRequest):
    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    tm = container.get(Services.TASK_MANAGER)
    
    # 1. Create a tracking task
    task_id = await tm.create_task(
        task_type="extract", 
        task_name="OCR Extraction", 
        request_params={
            "video_path": request.video_path,
            "engine": request.engine,
            "roi": request.roi
        }
    )

    # 2. Define the background worker
    async def run_ocr_task():
        try:
            # Get Engine
            engine = get_ocr_engine(request.engine)
            
            # Auto-download models if needed (with progress)
            if isinstance(engine, RapidOCREngine) and not engine.ocr:
                 await tm.update_task(task_id, status="running", message="Initializing OCR Models...", progress=0)
                 
                 loop = asyncio.get_running_loop()
                 def download_bridge(p, msg):
                     asyncio.run_coroutine_threadsafe(
                         tm.update_task(task_id, progress=round(p * 20, 1), message=msg), 
                         loop
                     )
                 
                 await asyncio.to_thread(engine.initialize_models, download_bridge)

            # Start Extraction
            await tm.update_task(task_id, status="running", message="Starting extraction...", progress=0)
            
            pipeline = VideoOCRPipeline(engine)
            roi_tuple = tuple(request.roi) if request.roi and len(request.roi) == 4 else None
            
            loop = asyncio.get_running_loop()
            import time
            last_update = 0
            
            def progress_bridge(p, msg):
                nonlocal last_update
                now = time.time()
                # Throttle updates to ~0.5s to avoid DB spam
                if now - last_update > 0.5 or p >= 1.0:
                    asyncio.run_coroutine_threadsafe(
                        tm.update_task(task_id, progress=round(p * 100, 1), message=msg),
                        loop
                    )
                    last_update = now

            events = await asyncio.to_thread(
                pipeline.process_video,
                video_path=request.video_path,
                roi=roi_tuple,
                sample_rate=request.sample_rate,
                progress_callback=progress_bridge
            )
            
            # --- Save Results to Disk ---
            import json
            
            base_path, _ = os.path.splitext(request.video_path)
            json_path = f"{base_path}.ocr.json"
            srt_path = f"{base_path}.ocr.srt"
            
            # Save JSON
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump([e.model_dump() for e in events], f, ensure_ascii=False, indent=2)
                
            # Save SRT
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
            
            # Save results
            await tm.update_task(
                task_id, 
                status="completed", 
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
            logger.error(f"OCR Task failed: {e}")
            await tm.update_task(task_id, status="failed", error=str(e))

    # 3. Launch background task (fire and forget)
    asyncio.create_task(run_ocr_task())

    return OCRExtractResponse(task_id=task_id)

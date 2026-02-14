from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile
from pydantic import BaseModel
from typing import Optional
import os
from src.services.video_synthesizer import VideoSynthesizer
from src.core.container import container, Services
import uuid


def _get_synthesizer() -> VideoSynthesizer:
    """Get VideoSynthesizer from DI container."""
    return container.get(Services.VIDEO_SYNTHESIZER)

router = APIRouter(prefix="/editor", tags=["Editor"])

class PSDConvertRequest(BaseModel):
    file_path: str

class SynthesisRequest(BaseModel):
    video_path: str
    srt_path: str
    watermark_path: Optional[str] = None
    output_path: Optional[str] = None
    options: Optional[dict] = None

@router.post("/preview/upload-watermark")
async def upload_watermark_for_preview(file: UploadFile):
    """
    Upload a watermark file, trim transparency, save as 'latest.png', and return preview.
    """
    from loguru import logger
    from src.config import settings
    import shutil
    import base64
    from PIL import Image
    
    logger.info(f"[Preview] Received Watermark Upload: {file.filename}")
    
    try:
        # Save to PERMANENT location
        watermarks_dir = settings.USER_DATA_DIR / "watermarks"
        watermarks_dir.mkdir(parents=True, exist_ok=True)
        # We process to a temp file first, then move to permanent
        
        temp_id = str(uuid.uuid4())
        temp_input_path = settings.TEMP_DIR / f"{temp_id}_{file.filename}"
        
        with open(temp_input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process (Trim & Convert) -> Returns path to trimmed PNG
        png_path = _get_synthesizer().process_watermark(str(temp_input_path))
        
        # Move to Persistent 'latest.png'
        persistent_path = watermarks_dir / "latest.png"
        shutil.move(png_path, persistent_path)
        
        logger.info(f"[Preview] Moved persistent watermark to: {persistent_path}")

        # Cleanup Temp Files immediately
        import time
        time.sleep(0.2) # Yield to OS to release handles
        
        try:
            if temp_input_path.exists():
                os.remove(temp_input_path)
                logger.debug(f"[Preview] Deleted temp input: {temp_input_path.name}")
        except Exception as e:
            logger.warning(f"[Preview] Failed to delete temp input: {e}")
        
        # Get Dimensions
        with Image.open(persistent_path) as img:
            width, height = img.size
        
        # Read file and convert to base64
        with open(persistent_path, "rb") as f:
            b64_data = base64.b64encode(f.read()).decode("utf-8")
            
        return {
            "png_path": str(persistent_path), 
            "data_url": f"data:image/png;base64,{b64_data}",
            "width": width,
            "height": height
        }
    except Exception as e:
        logger.exception(f"[Preview] Failed to process upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/preview/watermark/latest")
async def get_current_watermark():
    """
    Retrieve the last uploaded watermark (if exists).
    Returns: { png_path, data_url, width, height } or 404
    """
    from src.config import settings
    import base64
    from PIL import Image
    
    watermarks_dir = settings.USER_DATA_DIR / "watermarks"
    persistent_path = watermarks_dir / "latest.png"
    
    if not persistent_path.exists():
        return None # No watermark saved yet
    
    try:
        with Image.open(persistent_path) as img:
            width, height = img.size
            
        with open(persistent_path, "rb") as f:
            b64_data = base64.b64encode(f.read()).decode("utf-8")
            
        return {
            "png_path": str(persistent_path),
            "data_url": f"data:image/png;base64,{b64_data}",
            "width": width,
            "height": height
        }
    except Exception as e:
        # If file is corrupted, return nothing
        return None

async def run_synthesis_task(task_id: str, req: SynthesisRequest):
    """
    Execute synthesis task using BackgroundTaskRunner for real-time progress.
    """
    from src.core.task_runner import BackgroundTaskRunner
    from loguru import logger
    import json
    logger.info(f"Synthesis Options: {json.dumps(req.options, indent=2)}")
    
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=_get_synthesizer().burn_in_subtitles,
        worker_kwargs={
            "video_path": req.video_path,
            "srt_path": req.srt_path,
            "output_path": req.output_path,
            "watermark_path": req.watermark_path,
            "options": req.options,
        },
        start_message="Preparing synthesis...",
        success_message="Synthesis completed!",
        result_transformer=lambda path: {"video_path": path},
    )


@router.post("/synthesize")
async def start_synthesis_task(req: SynthesisRequest, background_tasks: BackgroundTasks):
    """
    Start a video synthesis task (burn-in subtitles/watermark).
    This is a long-running process, so we offload it.
    """
    if not os.path.exists(req.video_path):
        raise HTTPException(status_code=404, detail=f"Video not found: {req.video_path}")
    
    if not os.path.exists(req.srt_path):
        raise HTTPException(status_code=404, detail=f"Subtitle not found: {req.srt_path}")

    # Determine output path if not provided
    if not req.output_path:
        base, ext = os.path.splitext(req.video_path)
        req.output_path = f"{base}_burned.mp4"

    task_manager = container.get(Services.TASK_MANAGER)
    
    # Create the task entry
    # Note: create_task generates the ID and returns it
    task_id = await task_manager.create_task(
        task_type="synthesis",
        task_name=os.path.basename(req.video_path),
        initial_message="Queued",
        request_params=req.dict()
    )
    
    # Start background execution
    background_tasks.add_task(run_synthesis_task, task_id, req)

    return {"task_id": task_id, "status": "pending"}

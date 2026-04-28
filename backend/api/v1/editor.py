from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel
import os
from backend.application.synthesis_service import submit_synthesis_task
from backend.core.runtime_access import RuntimeServices
from backend.models.schemas import SynthesisRequest
from backend.utils.path_validator import validate_input_file, validate_output_file
import uuid

router = APIRouter(prefix="/editor", tags=["Editor"])

class PSDConvertRequest(BaseModel):
    file_path: str



@router.post("/preview/upload-watermark")
async def upload_watermark_for_preview(file: UploadFile):
    """
    Upload a watermark file, trim transparency, save as 'latest.png', and return preview.
    """
    from loguru import logger
    from backend.config import settings
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
        temp_input_path = settings.WORKSPACE_DIR / f"{temp_id}_{file.filename}"
        
        with open(temp_input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process (Trim & Convert) -> Returns path to trimmed PNG
        from backend.services.video.watermark_processor import WatermarkProcessor

        png_path = WatermarkProcessor.process_watermark(str(temp_input_path))
        
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
    from backend.config import settings
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

@router.post("/synthesize")
async def start_synthesis_task(req: SynthesisRequest):
    """
    Start a video synthesis task (burn-in subtitles/watermark).
    This is a long-running process, so we offload it.
    """
    if not req.video_path:
        raise HTTPException(status_code=400, detail="synthesis video path is required")
    if not req.srt_path:
        raise HTTPException(status_code=400, detail="synthesis subtitle path is required")

    try:
        req.video_path = str(validate_input_file(req.video_path, label="video_path"))
        req.srt_path = str(validate_input_file(req.srt_path, label="srt_path"))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine output path if not provided
    if not req.output_path:
        base, ext = os.path.splitext(req.video_path)
        req.output_path = f"{base}_burned.mp4"
    try:
        req.output_path = str(validate_output_file(req.output_path, label="output_path"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    response = await submit_synthesis_task(req)

    return {"task_id": response["task_id"], "status": response["status"]}

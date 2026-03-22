from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import logging
from backend.models.schemas import MediaReference

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Data Models ---

class EnhanceRequest(BaseModel):
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    model: Optional[str] = None # Allow None to use backend default
    scale: str = "4x"
    method: str = "realesrgan" # realesrgan | basicvsr

    @property
    def resolved_video_path(self) -> Optional[str]:
        if self.video_ref and self.video_ref.path:
            return self.video_ref.path
        return self.video_path

class CleanRequest(BaseModel):
    video_path: Optional[str] = None
    video_ref: Optional[MediaReference] = None
    roi: List[int] # [x, y, w, h]
    method: str = "telea"

    @property
    def resolved_video_path(self) -> Optional[str]:
        if self.video_ref and self.video_ref.path:
            return self.video_ref.path
        return self.video_path

class PreprocessingResponse(BaseModel):
    task_id: str
    status: str
    message: str

# --- Endpoints ---

from backend.core.container import container, Services
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import TaskResult, FileRef
from backend.services.media_refs import create_media_ref
import os

@router.post("/enhance", response_model=PreprocessingResponse)
async def enhance_video(request: EnhanceRequest):
    """
    Video Enhancement (Super Resolution) using Real-ESRGAN or BasicVSR++.
    """
    from backend.utils.path_validator import validate_path
    if not request.resolved_video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    request = request.model_copy(update={"video_path": request.resolved_video_path})
    validate_path(request.video_path, "video_path")

    enhancer = container.get(Services.ENHANCER)
    # 1. Check availability
    if not enhancer.is_available(request.method):
        detail = "Real-ESRGAN binary not found." if request.method == "realesrgan" else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        raise HTTPException(status_code=503, detail=detail)

    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail=f"Video file not found: {request.video_path}")

    # 2. Determine output path
    p = Path(request.video_path)
    # Parse scale (e.g. "4x" -> 4)
    try:
        scale_val = int(request.scale.lower().replace('x', ''))
    except (ValueError, AttributeError):
        scale_val = 4
        
    output_filename = f"{p.stem}_{request.method}_{scale_val}x{p.suffix}"
    output_path = p.parent / output_filename

    # 3. Create Task
    task_name = f"Enhance {p.name} ({request.method} {request.scale})"
    # 4. Result Transformer
    def transform_result(path):
        output_ref = create_media_ref(path, "video/mp4", role="output")
        return TaskResult(
            success=True,
            files=[FileRef(type="video", path=path, label="upscaled_video")],
            meta={
                "video_path": path,
                "original_path": request.video_path,
                "video_ref": output_ref,
                "output_ref": output_ref,
                "model": request.model,
                "scale": scale_val,
                "method": request.method
            }
        ).dict()

    # 5. Run in Background
    response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
        task_type="enhancement",
        initial_message=f"Initializing {request.method}...",
        queued_message=f"Initializing {request.method}...",
        task_name=task_name,
        request_params=request.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
            task_id=task_id,
            worker_fn=enhancer.upscale,
            worker_kwargs={
                "input_path": request.video_path,
                "output_path": str(output_path),
                "model": request.model,
                "scale": scale_val,
                "method": request.method
            },
            start_message=f"Running {request.method}...",
            success_message="Upscaling complete",
            result_transformer=transform_result
        ),
    )

    return PreprocessingResponse(
        task_id=response["task_id"],
        status="queued",
        message=f"Enhancement started (Task {response['task_id']})"
    )

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_video(
    request: CleanRequest,
):
    """
    Video Cleanup (Watermark Removal) using OpenCV or ProPainter.
    """
    from backend.utils.path_validator import validate_path
    if not request.resolved_video_path:
        raise HTTPException(status_code=422, detail="video_path or video_ref is required")
    request = request.model_copy(update={"video_path": request.resolved_video_path})
    validate_path(request.video_path, "video_path")

    cleaner = container.get(Services.CLEANER)
    p = Path(request.video_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
        
    method = request.method or "telea"
    output_path = p.with_name(f"{p.stem}_cleaned_{method}{p.suffix}")
    
    def save_result(out_path):
        output_ref = create_media_ref(out_path, "video/mp4", role="output")
        return TaskResult(
            success=True,
            files=[FileRef(type="video", path=out_path, label="cleaned")],
            meta={
                "video_path": out_path,
                "video_ref": output_ref,
                "output_ref": output_ref,
                "original_path": request.video_path,
            }
        ).dict()
        
    # Validation logic for ROI?
    # CleanerService handles it.
    
    response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
        task_type="cleanup",
        initial_message="Queued for Cleanup",
        queued_message="Queued for Cleanup",
        task_name=f"Clean {p.name}",
        request_params=request.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
            task_id=task_id,
            worker_fn=cleaner.clean_video,
            worker_kwargs={
                "input_path": request.video_path,
                "output_path": str(output_path),
                "roi": request.roi,
                "method": method
            },
            start_message=f"Running Watermark Removal ({method})...",
            success_message="Cleanup complete",
            result_transformer=save_result
        ),
    )

    return PreprocessingResponse(
        task_id=response["task_id"],
        status="queued",
        message=f"Cleanup started (Task {response['task_id']})"
    )

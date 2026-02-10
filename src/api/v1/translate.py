from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from src.models.schemas import SubtitleSegment, TaskResponse
from src.core.task_runner import BackgroundTaskRunner
from src.core.container import container, Services

router = APIRouter(prefix="/translate", tags=["Translator"])


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


def _get_llm_translator():
    return container.get(Services.LLM_TRANSLATOR)


class TranslateRequest(BaseModel):
    segments: List[SubtitleSegment]
    target_language: str = "Chinese"
    mode: str = "standard"  # standard, reflect
    context_path: Optional[str] = None  # Path to source file for reference/saving

class TranslateResponse(BaseModel):
    task_id: str
    status: str
    segments: Optional[List[SubtitleSegment]] = None

async def run_translation_task(task_id: str, req: TranslateRequest):
    """
    Background translation task.
    Uses BackgroundTaskRunner to eliminate boilerplate.
    """
    llm_translator = _get_llm_translator()
    
    # We need to define result_transformer that can save file if path exists
    def save_and_transform(segments):
        res = {"segments": [seg.dict() for seg in segments]}
        
        # If we have a context path, save the SRT
        if req.context_path and segments:
            try:
                from src.utils.subtitle_manager import SubtitleManager
                from pathlib import Path
                
                # Determine output path (e.g. original_CN.srt)
                # We can use a simple mapping or just append target lang
                # Default to _Translated if language code not easy to guess, but usually we have target_language
                suffix = f"_{req.target_language}"
                if req.target_language == "Chinese": suffix = "_CN"
                elif req.target_language == "English": suffix = "_EN"
                
                source_path = Path(req.context_path)
                # Check if source exists to be safe, though not strictly required for saving *next to* it
                parent_dir = source_path.parent
                stem = source_path.stem
                
                save_path = parent_dir / f"{stem}{suffix}.srt"
                
                # Save
                saved_path = SubtitleManager.save_srt(segments, str(save_path).replace(".srt", "")) 
                # Note: save_srt appends .srt, so we strip it from input or adjust args. 
                # SubtitleManager.save_srt(segments, audio_path) -> saves audio_path.srt
                # So we pass save_path without extension
                
                res["srt_path"] = saved_path
                res["file_path"] = saved_path # For generic handlers
                
            except Exception as e:
                logger.error(f"Failed to save translated SRT: {e}")
        
        return res

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=llm_translator.translate_segments,
        worker_kwargs={
            "segments": req.segments,
            "target_language": req.target_language,
            "mode": req.mode,
        },
        start_message="Starting translation...",
        success_message="Translation completed",
        result_transformer=save_and_transform,
    )


@router.post("/", response_model=TranslateResponse)
async def translate_subtitles(req: TranslateRequest, background_tasks: BackgroundTasks):
    """
    Submit a translation task.
    """
    try:
        task_id = await _get_task_manager().create_task(
            task_type="translate",
            initial_message="Queued",
            task_name=f"Translate to {req.target_language}",
            request_params={
                "mode": req.mode, 
                "count": len(req.segments),
                "context_path": req.context_path,
                "srt_path": req.context_path # Hint for UI if we want it to show "Transcribing..." on the file? No, this is source. 
            }
        )
        
        background_tasks.add_task(run_translation_task, task_id, req)
        
        return TranslateResponse(task_id=task_id, status="pending")
        
    except Exception as e:
        logger.error(f"Failed to submit translation task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

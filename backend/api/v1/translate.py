from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from backend.models.schemas import SubtitleSegment, TaskResponse, TaskResult, FileRef
from backend.core.task_runner import BackgroundTaskRunner
from backend.core.container import container, Services

router = APIRouter(prefix="/translate", tags=["Translator"])

LANGUAGE_SUFFIX_MAP = {
    "Chinese": "_CN",
    "English": "_EN",
    "Japanese": "_JP",
    "Spanish": "_ES",
    "French": "_FR",
    "German": "_DE",
    "Russian": "_RU",
}


def get_language_suffix(target_language: str) -> str:
    return LANGUAGE_SUFFIX_MAP.get(target_language, f"_{target_language}")


def get_translation_output_suffix(target_language: str, mode: str) -> str:
    if mode == "proofread":
        return "_PR"
    return get_language_suffix(target_language)


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
    llm_translator = container.get(Services.LLM_TRANSLATOR)
    
    # We need to define result_transformer that can save file if path exists
    def save_and_transform(segments):
        files = []
        meta = {
            "segments": [seg.dict() for seg in segments],
            "language": req.target_language
        }
        
        # If we have a context path, save the SRT
        if req.context_path and segments:
            try:
                from backend.utils.subtitle_manager import SubtitleManager
                from pathlib import Path
                
                # Determine output path (e.g. original_CN.srt)
                suffix = get_translation_output_suffix(req.target_language, req.mode)
                
                source_path = Path(req.context_path)
                stem = source_path.stem
                parent_dir = source_path.parent
                
                logger.debug(f"[Translate] Context Path: {req.context_path}")
                logger.debug(f"[Translate] Stem: {stem}, Suffix: {suffix}")
                
                logger.debug(
                    f"[Translate] Save Path Resolution: "
                    f"context={req.context_path}, stem={stem}, suffix={suffix}, "
                    f"proposed={parent_dir / f'{stem}{suffix}'}"
                )

                save_path = parent_dir / f"{stem}{suffix}" # save_srt appends .srt
                logger.debug(f"[Translate] Target Save Path: {save_path}.srt")
                
                # Save
                saved_path = SubtitleManager.save_srt(segments, str(save_path)) 
                
                files.append(FileRef(type="subtitle", path=str(saved_path), label="translation"))
                meta["srt_path"] = str(saved_path)
                
            except Exception as e:
                logger.error(f"Failed to save translated SRT: {e}")
        
        return TaskResult(
            success=True,
            files=files,
            meta=meta
        ).dict()

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=llm_translator.translate_segments,
        worker_kwargs={
            "segments": req.segments,
            "target_language": req.target_language,
            "mode": req.mode,
            "batch_size": 10
        },
        start_message="Starting translation...",
        success_message="Translation completed",
        result_transformer=save_and_transform,
    )


@router.post("/segment", response_model=TranslateResponse)
async def translate_segment_sync(req: TranslateRequest):
    """
    Synchronous translation for editor context menu.
    Designed for small batches (user selection).
    Uses run_in_executor to avoid blocking the event loop.
    """
    import asyncio
    from functools import partial

    translator = container.get(Services.LLM_TRANSLATOR)
    try:
        loop = asyncio.get_running_loop()
        func = partial(
            translator.translate_segments,
            req.segments,
            req.target_language,
            req.mode,
            batch_size=max(1, len(req.segments)),
        )
        translated = await loop.run_in_executor(None, func)

        return TranslateResponse(
            task_id="sync_translation",
            status="completed",
            segments=translated
        )
    except Exception as e:
        logger.error(f"Sync translation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=TranslateResponse)
async def translate_subtitles(req: TranslateRequest):
    """
    Submit a translation task.
    """
    try:
        # Extract filename from context_path if available
        from pathlib import Path
        from backend.utils.path_validator import validate_path
        source_name = "Subtitles"
        if req.context_path:
            validate_path(req.context_path, "context_path")
            source_name = Path(req.context_path).name

        response = await container.get(Services.TASK_ORCHESTRATOR).submit_task(
            task_type="translate",
            task_name=f"{source_name} ({req.target_language})",
            request_params=req.model_dump(mode="json"),
            runner_factory=lambda task_id: lambda: run_translation_task(task_id, req),
        )
        
        return TranslateResponse(task_id=response["task_id"], status=response["status"])
        
    except Exception as e:
        logger.error(f"Failed to submit translation task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

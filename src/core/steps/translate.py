
import asyncio
from pathlib import Path
from loguru import logger

from src.core.steps.base import PipelineStep
from src.core.steps.registry import StepRegistry
from src.core.context import PipelineContext
from src.core.container import container, Services
from src.utils.subtitle_manager import SubtitleManager
from src.models.schemas import SubtitleSegment, FileRef

def _get_translator():
    return container.get(Services.LLM_TRANSLATOR)

def _get_task_manager():
    return container.get(Services.TASK_MANAGER)

class TranslateStep(PipelineStep):
    @property
    def name(self) -> str:
        return "translate"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Input Validation
        segments_data = ctx.get("segments")
        if not segments_data:
            raise ValueError("Translate step requires 'segments' in context (from transcribe step)")
        
        # Convert dicts back to Pydantic models if needed
        # PipelineRunner serialization might turn them into dicts
        segments = [SubtitleSegment(**s) if isinstance(s, dict) else s for s in segments_data]
            
        target_language = params.get("target_language")
        if not target_language:
            raise ValueError("Translate step requires 'target_language' param")
            
        mode = params.get("mode", "standard")
        
        # 2. Dependencies
        translator = _get_translator()
        tm = _get_task_manager()
        loop = asyncio.get_running_loop()

        # 3. Execution
        def progress_cb(percent, msg):
            if task_id:
                asyncio.run_coroutine_threadsafe(
                    tm.update_task(task_id, progress=percent, message=msg),
                    loop
                )

        translated_segments = await loop.run_in_executor(
            None,
            lambda: translator.translate_segments(
                segments, 
                target_language=target_language,
                mode=mode,
                progress_callback=progress_cb
            )
        )
        
        if not translated_segments:
            raise Exception("Translation produced no segments")

        # 4. Save Output
        # Determine output path based on input specific inputs if available
        # But usually we want it next to the source audio/video
        # Let's use video_path or srt_path from context as base
        base_path = ctx.get("srt_path") or ctx.get("video_path")
        
        if base_path:
            p = Path(base_path)
            # e.g., video.en.srt -> video.zh.srt
            # simplified: name.target_lang.srt
            output_filename = f"{p.stem}.{target_language}.srt"
            output_path = p.parent / output_filename
        else:
            # Fallback
            output_path = Path(f"translated_{target_language}.srt")
            
        saved_path = SubtitleManager.save_srt(translated_segments, str(output_path))
        
        # 5. Update Context
        ctx.set("translated_srt_path", saved_path)
        ctx.set("translated_segments", [s.dict() for s in translated_segments])
        
        # Update "srt_path" to point to the TRANSLATED one for subsequent steps (Synthesis)
        # This allows the chain: Transcribe -> Translate -> Synthesize
        # Synthesis breaks if it receives the original language SRT when user wanted translation
        ctx.set("srt_path", saved_path)
        
        logger.success(f"Step Translate finished. Saved to: {saved_path}")

# Register
StepRegistry.register(TranslateStep())

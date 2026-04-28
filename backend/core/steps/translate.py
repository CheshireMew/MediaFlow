from pathlib import Path
from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.steps.registry import StepRegistry
from backend.core.context import PipelineContext
from backend.core.runtime_access import RuntimeServices, TaskRuntimeContext
from backend.utils.subtitle_manager import SubtitleManager
from backend.models.schemas import SubtitleSegment, FileRef

class TranslateStep(PipelineStep):
    @property
    def name(self) -> str:
        return "translate"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Input Validation
        segments_data = ctx.get("segments")
        if not segments_data:
            raise ValueError("Translate step requires 'segments' in context (from transcribe step)")

        segments = [SubtitleSegment(**s) if isinstance(s, dict) else s for s in segments_data]

        target_language = params.get("target_language")
        if not target_language:
            raise ValueError("Translate step requires 'target_language' param")

        mode = params.get("mode", "standard")

        # 2. Dependencies
        translator = RuntimeServices.translator()
        runtime = TaskRuntimeContext.for_task(task_id)

        # 3. Execution
        translated_segments = await runtime.run_blocking(
            lambda: translator.translate_segments(
                segments, 
                target_language=target_language,
                mode=mode,
                progress_callback=runtime.build_progress_callback()
            )
        )
        
        if not translated_segments:
            raise Exception("Translation produced no segments")

        # 4. Save Output
        # Determine output path based on input specific inputs if available
        # But usually we want it next to the source audio/video
        # Let's use video_path or srt_path from context as base
        base_path = (
            ctx.get_media_path("subtitle_ref", "srt_path", "subtitle_path", "video_path")
            or params.get("srt_path")
            or (params.get("context_ref") or {}).get("path")
        )
        
        if base_path:
            p = Path(base_path)
            
            # Standard Suffix Map (matching frontend/backend API)
            suffix_map = {
                "Chinese": "_CN",
                "English": "_EN", 
                "Japanese": "_JP",
                "Spanish": "_ES", 
                "French": "_FR",
                "German": "_DE",
                "Russian": "_RU"
            }
            lang_suffix = suffix_map.get(target_language, f"_{target_language}")
            
            # e.g., video.mp4 -> video_CN.srt
            output_filename = f"{p.stem}{lang_suffix}.srt"
            output_path = p.parent / output_filename
        else:
            # Fallback
            output_path = Path(f"translated_{target_language}.srt")
            
        saved_path = SubtitleManager.save_srt(translated_segments, str(output_path))
        
        # 5. Update Context
        ctx.set("translated_segments", [s.dict() for s in translated_segments])
        ctx.set_media(
            path_key="srt_path",
            ref_key="subtitle_ref",
            path=saved_path,
            media_type="application/x-subrip",
            extra_ref_keys=("context_ref", "output_ref"),
        )
        
        logger.success(f"Step Translate finished. Saved to: {saved_path}")

# Register
StepRegistry.register(TranslateStep())


import asyncio
from pathlib import Path
from loguru import logger

from src.core.steps.base import PipelineStep
from src.core.steps.registry import StepRegistry
from src.core.context import PipelineContext
from src.core.container import container, Services
from src.models.schemas import FileRef

def _get_synthesizer():
    return container.get(Services.VIDEO_SYNTHESIZER)

def _get_task_manager():
    return container.get(Services.TASK_MANAGER)

class SynthesizeStep(PipelineStep):
    @property
    def name(self) -> str:
        return "synthesize"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Inputs
        video_path = ctx.get("video_path")
        srt_path = ctx.get("srt_path")
        
        if not video_path or not srt_path:
            raise ValueError("Synthesize step requires 'video_path' and 'srt_path' in context")
            
        # 2. Output Path
        # Logic: video.mp4 -> video_synthesized.mp4
        p = Path(video_path)
        output_path = p.parent / f"{p.stem}_synthesized.mp4"
        
        # 3. Execution
        synthesizer = _get_synthesizer()
        tm = _get_task_manager()
        loop = asyncio.get_running_loop()
        
        # Merge options from params
        options = params.get("options", {})
        
        # Add crop/trim if present in params (passed from frontend)
        # We need to ensure we pass everything relevant
        
        def progress_cb(percent, msg):
             if task_id:
                asyncio.run_coroutine_threadsafe(
                    tm.update_task(task_id, message=msg),
                    loop
                )

        if task_id:
            await tm.update_task(task_id, message="Starting FFmpeg synthesis...")

        output_file = await loop.run_in_executor(
            None,
            lambda: synthesizer.burn_in_subtitles(
                video_path, 
                srt_path, 
                str(output_path), 
                watermark_path=params.get("watermark_path"),
                options=options,
                progress_callback=progress_cb
            )
        )
        
        # 4. Context Update
        ctx.set("output_video_path", output_file)
        # Update "video_path" to point to the synthesized one for downstream steps and final result
        ctx.set("video_path", output_file)
        
        logger.success(f"Step Synthesize finished. Output: {output_file}")

# Register
StepRegistry.register(SynthesizeStep())

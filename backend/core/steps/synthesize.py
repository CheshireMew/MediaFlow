
import asyncio
from pathlib import Path
from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.steps.registry import StepRegistry
from backend.core.context import PipelineContext
from backend.core.container import container, Services
from backend.models.schemas import FileRef

class SynthesizeStep(PipelineStep):
    @property
    def name(self) -> str:
        return "synthesize"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Inputs — ctx takes priority (set by upstream steps), fall back to params
        video_path = (
            ctx.get_media_path("video_ref", "video_path")
            or params.get("video_path")
            or (params.get("video_ref") or {}).get("path")
        )
        srt_path = (
            ctx.get_media_path("subtitle_ref", "srt_path", "subtitle_path")
            or params.get("srt_path")
            or (params.get("srt_ref") or {}).get("path")
        )

        if not video_path or not srt_path:
            raise ValueError("Synthesize step requires 'video_path' and 'srt_path' in context")

        # 2. Output Path
        p = Path(video_path)
        output_path = p.parent / f"{p.stem}_synthesized.mp4"

        # 3. Execution
        synthesizer = container.get(Services.VIDEO_SYNTHESIZER)
        tm = container.get(Services.TASK_MANAGER)
        loop = asyncio.get_running_loop()

        options = params.get("options", {})
        
        def progress_cb(percent, msg):
             if task_id:
                tm.raise_if_control_requested(task_id)
                tm.submit_threadsafe_update(
                    loop,
                    task_id,
                    progress=float(percent),
                    message=msg,
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
        ctx.set_media(
            path_key="video_path",
            ref_key="video_ref",
            path=output_file,
            media_type="video/mp4",
            extra_ref_keys=("output_ref",),
        )
        
        logger.success(f"Step Synthesize finished. Output: {output_file}")

# Register
StepRegistry.register(SynthesizeStep())

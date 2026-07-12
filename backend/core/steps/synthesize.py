from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.schemas import MediaReference
from backend.services.generated_output_paths import build_suffixed_output_path
from backend.services.media_refs import create_media_ref

class SynthesizeStep(PipelineStep):
    def __init__(self, *, synthesis, task_manager):
        self._synthesis = synthesis
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "synthesize"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Inputs �?ctx takes priority (set by upstream steps), fall back to params
        video_ref = ctx.get_media("video_ref")
        if video_ref is None and params.get("video_ref"):
            video_ref = MediaReference.model_validate(params["video_ref"])
        subtitle_ref = ctx.get_media("subtitle_ref")
        if subtitle_ref is None and params.get("srt_ref"):
            subtitle_ref = MediaReference.model_validate(params["srt_ref"])
        watermark_ref = (
            MediaReference.model_validate(params["watermark_ref"])
            if params.get("watermark_ref")
            else None
        )

        if not video_ref or not subtitle_ref:
            raise ValueError("Synthesize step requires video_ref and srt_ref")
        video_path = video_ref.path
        srt_path = subtitle_ref.path

        # 2. Output Path
        output_path = build_suffixed_output_path(
            video_path,
            "_synthesized",
            extension=".mp4",
        )

        # 3. Execution
        runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)

        options = params.get("options", {})

        if task_id:
            await runtime.update(
                message_code="synthesis_starting",
                message_params={},
            )

        output_file = await runtime.run_blocking(
            lambda: self._synthesis.synthesize(
                video_path, 
                srt_path, 
                str(output_path), 
                watermark_path=watermark_ref.path if watermark_ref else None,
                options=options,
                progress_callback=runtime.build_progress_callback(progress_transform=float)
            )
        )
        
        # 4. Context Update
        output_ref = create_media_ref(output_file, "video/mp4", role="output")
        if output_ref is None:
            raise RuntimeError("Synthesis output reference could not be created")
        ctx.set_media("video_ref", output_ref, kind="video")
        
        logger.success(f"Step Synthesize finished. Output: {output_file}")

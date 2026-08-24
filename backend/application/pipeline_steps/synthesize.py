from loguru import logger

from backend.application.pipeline_steps.base import PipelineStep
from backend.application.synthesis_service import build_synthesis_worker_kwargs
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.media_contracts import MediaReference
from backend.models.synthesis_contracts import SynthesisOptions, SynthesisRequest
from backend.models.task_result_contracts import SynthesisOutput
from backend.services.media_refs import create_media_ref


class SynthesizeStep(PipelineStep):
    resume_policy = "replace_output"

    def __init__(self, *, synthesis, task_manager):
        self._synthesis = synthesis
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "synthesize"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str | None = None):
        ctx.begin_step(self.name)
        # Upstream pipeline media takes priority; explicit parameters are the fallback.
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

        options = SynthesisOptions.model_validate(params.get("options") or {})
        if not video_ref:
            raise ValueError("Synthesize step requires video_ref")
        if not subtitle_ref and not options.skip_subtitles:
            raise ValueError("Synthesize step requires srt_ref unless subtitles are disabled")
        requested_output_ref = (
            MediaReference.model_validate(params["output_ref"])
            if params.get("output_ref")
            else None
        )
        request = SynthesisRequest(
            video_ref=video_ref,
            srt_ref=subtitle_ref,
            output_ref=requested_output_ref,
            watermark_ref=watermark_ref,
            options=options,
        )

        runtime = TaskRuntimeContext(
            task_id,
            task_manager=self._task_manager,
            progress_transform=ctx.project_step_progress,
        )

        if task_id:
            await runtime.update(
                message_code="synthesis_starting",
                message_params={},
            )

        output_file = await runtime.run_blocking(
            lambda: self._synthesis.synthesize(
                **build_synthesis_worker_kwargs(
                    request,
                    progress_callback=runtime.build_progress_callback(
                        progress_transform=float
                    ),
                )
            )
        )
        
        output_ref = create_media_ref(output_file, "video/mp4", role="output")
        if output_ref is None:
            raise RuntimeError("Synthesis output reference could not be created")
        ctx.set_media("video_ref", output_ref, kind="video")
        ctx.publish_synthesis(SynthesisOutput())
        
        logger.success(f"Step Synthesize finished. Output: {output_file}")

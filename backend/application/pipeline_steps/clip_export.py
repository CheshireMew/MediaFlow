from backend.application.clip_export_service import export_clips
from backend.application.pipeline_steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.editor_contracts import ClipExportRequest
from backend.models.media_contracts import TaskArtifact
from backend.models.task_result_contracts import ClipExportOutput


class ClipExportStep(PipelineStep):
    resume_policy = "atomic_publish"

    def __init__(self, *, video_synthesis, task_manager):
        self._video_synthesis = video_synthesis
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "clip_export"

    async def execute(
        self,
        ctx: PipelineContext,
        params: dict,
        task_id: str | None = None,
    ) -> None:
        ctx.begin_step(self.name)
        request = ClipExportRequest.model_validate(params)
        runtime = TaskRuntimeContext(
            task_id,
            task_manager=self._task_manager,
            progress_transform=ctx.project_step_progress,
        )
        exported = await runtime.run_blocking(
            lambda: export_clips(
                video_synthesis=self._video_synthesis,
                video_ref=request.video_ref,
                segments=request.segments,
                render_mode=request.render_mode,
                srt_ref=request.srt_ref,
                watermark_ref=request.watermark_ref,
                options=request.options,
                output_dir=request.output_dir,
                progress_callback=runtime.build_progress_callback(),
            )
        )
        for media_ref in exported:
            ctx.add_artifact(
                TaskArtifact(kind="video", role="output", ref=media_ref)
            )
        ctx.publish_clip_export(ClipExportOutput(count=len(exported)))

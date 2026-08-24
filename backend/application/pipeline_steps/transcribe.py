from loguru import logger

from backend.application.pipeline_steps.base import PipelineStep
from backend.application.transcription_service import build_transcription_worker_kwargs
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.media_contracts import MediaReference
from backend.models.transcription_contracts import TranscribeRequest


class TranscribeStep(PipelineStep):
    resume_policy = "replace_output"

    def __init__(self, *, asr_service, task_manager):
        self._asr_service = asr_service
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "transcribe"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str | None = None):
        ctx.begin_step(self.name)
        input_ref = ctx.get_media("audio_ref", "video_ref")
        if input_ref is None and params.get("audio_ref"):
            input_ref = MediaReference.model_validate(params["audio_ref"])
        if input_ref is None:
            raise ValueError("Transcribe step requires audio_ref or a downloaded media reference")
        request = TranscribeRequest.model_validate(
            {
                **params,
                "audio_ref": input_ref,
            }
        )
        
        # Also run transcribe in executor because it blocks!
        runtime = TaskRuntimeContext(
            task_id,
            task_manager=self._task_manager,
            progress_transform=ctx.project_step_progress,
        )
        progress_cb = runtime.build_progress_callback()
        
        result = await runtime.run_blocking(
            lambda: self._asr_service.transcribe(
                **build_transcription_worker_kwargs(
                    request,
                    task_id=task_id,
                    progress_callback=progress_cb,
                )
            )
        )
        
        if not result.success:
            runtime.checkpoint()
            raise RuntimeError(result.error or "Transcription failed")
        transcription_output = result.outputs.transcription
        if transcription_output is None:
            raise RuntimeError(
                "Transcription succeeded without a typed transcription output"
            )
        ctx.publish_transcription(transcription_output)
        
        # Extract SRT path
        subtitle_artifact = next(
            (artifact for artifact in result.artifacts if artifact.kind == "subtitle"),
            None,
        )
        if subtitle_artifact:
            ctx.set_media(
                "subtitle_ref",
                subtitle_artifact.ref,
                kind="subtitle",
            )

        input_kind = str(input_ref.media_kind or "").lower()
        input_type = str(input_ref.type or "").lower()
        if ctx.get_media("video_ref") is None and (
            input_kind == "video" or input_type.startswith("video/")
        ):
            ctx.set_media(
                "video_ref",
                input_ref,
                kind="video",
                role="input",
                track_artifact=False,
            )
             
        logger.success(
            f"Step Transcribe finished. Text len: {len(transcription_output.text)}"
        )

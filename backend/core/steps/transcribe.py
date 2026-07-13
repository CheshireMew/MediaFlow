from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.schemas import MediaReference, TranscribeRequest
from backend.application.transcription_service import build_transcription_worker_kwargs


class TranscribeStep(PipelineStep):
    def __init__(self, *, asr_service, task_manager):
        self._asr_service = asr_service
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "transcribe"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
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
        runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)
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
            raise Exception(result.error or "Transcription failed")

        text = result.meta.get("text", "")
        segments = result.meta.get("segments", [])
        detected_language = result.meta.get("language", request.language or "auto")

        ctx.set("text", text)
        ctx.set("transcript", text)
        ctx.set("language", detected_language)
        ctx.set("segments", segments)
        
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
             
        logger.success(f"Step Transcribe finished. Text len: {len(text)}")

from loguru import logger

from backend.application.pipeline_steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.media_contracts import MediaReference
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.translation_contracts import TranslationRequest
from backend.application.translation_service import (
    build_translation_task_result,
    build_translation_worker_kwargs,
)

class TranslateStep(PipelineStep):
    def __init__(self, *, translator, task_manager):
        self._translator = translator
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "translate"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Input Validation
        transcription_output = ctx.outputs.transcription
        segments_data = (
            transcription_output.segments
            if transcription_output is not None
            else params.get("segments")
        )
        if not segments_data:
            raise ValueError("Translate step requires subtitle segments")

        segments = [SubtitleSegment(**s) if isinstance(s, dict) else s for s in segments_data]

        raw_target_language = params.get("target_language")
        if not raw_target_language:
            raise ValueError("Translate step requires 'target_language' param")
        mode = params.get("mode", "standard")

        base_ref = ctx.get_media("subtitle_ref", "video_ref")
        if base_ref is None and params.get("context_ref"):
            base_ref = MediaReference.model_validate(params["context_ref"])
        if base_ref is None:
            raise ValueError("Translate step requires a canonical input media reference")

        request = TranslationRequest(
            segments=segments,
            target_language=raw_target_language,
            mode=mode,
            context_ref=base_ref,
            batch_size=params.get("batch_size", 50),
        )

        # 2. Dependencies
        runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)

        # 3. Execution
        translated_segments = await runtime.run_blocking(
            lambda: self._translator.translate_segments(
                **build_translation_worker_kwargs(
                    request,
                    progress_callback=runtime.build_progress_callback(),
                )
            )
        )
        
        if not translated_segments:
            raise Exception("Translation produced no segments")

        # 4. Save Output next to the canonical input reference.
        result = build_translation_task_result(
            translated_segments,
            target_language=request.target_language,
            mode=mode,
            context_ref=base_ref,
        )
        translation_output = result.outputs.translation
        if translation_output is None:
            raise RuntimeError("Translation succeeded without a typed translation output")
        ctx.publish_translation(translation_output)
        output_artifact = next(
            (artifact for artifact in result.artifacts if artifact.kind == "subtitle"),
            None,
        )
        if output_artifact is None:
            raise RuntimeError("Translation output could not be created")
        ctx.set_media(
            "subtitle_ref",
            output_artifact.ref,
            kind="subtitle",
        )
        
        logger.success(f"Step Translate finished. Saved to: {output_artifact.ref.path}")

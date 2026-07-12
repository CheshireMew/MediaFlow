from pathlib import Path
from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext
from backend.utils.subtitle_writer import SubtitleWriter
from backend.models.schemas import MediaReference, SubtitleSegment
from backend.models.translation_target_language import get_language_suffix, parse_translation_target_language
from backend.services.generated_output_paths import build_suffixed_output_path

class TranslateStep(PipelineStep):
    def __init__(self, *, translator, task_manager):
        self._translator = translator
        self._task_manager = task_manager

    @property
    def name(self) -> str:
        return "translate"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # 1. Input Validation
        segments_data = ctx.get("segments")
        if not segments_data:
            raise ValueError("Translate step requires 'segments' in context (from transcribe step)")

        segments = [SubtitleSegment(**s) if isinstance(s, dict) else s for s in segments_data]

        raw_target_language = params.get("target_language")
        if not raw_target_language:
            raise ValueError("Translate step requires 'target_language' param")
        target_language = parse_translation_target_language(raw_target_language).value

        mode = params.get("mode", "standard")

        # 2. Dependencies
        runtime = TaskRuntimeContext(task_id, task_manager=self._task_manager)

        # 3. Execution
        translated_segments = await runtime.run_blocking(
            lambda: self._translator.translate_segments(
                segments, 
                target_language=target_language,
                mode=mode,
                progress_callback=runtime.build_progress_callback()
            )
        )
        
        if not translated_segments:
            raise Exception("Translation produced no segments")

        # 4. Save Output next to the canonical input reference.
        base_ref = ctx.get_media("subtitle_ref", "video_ref")
        if base_ref is None and params.get("context_ref"):
            base_ref = MediaReference.model_validate(params["context_ref"])
        if base_ref is None:
            raise ValueError("Translate step requires a canonical input media reference")

        p = Path(base_ref.path)
        lang_suffix = "_PR" if mode == "proofread" else get_language_suffix(target_language)
        output_path = build_suffixed_output_path(
            p,
            lang_suffix,
            extension=".srt",
        )
            
        saved_path = SubtitleWriter.save_srt(translated_segments, str(output_path))
        
        # 5. Update Context
        ctx.set(
            "translated_segments",
            [segment.model_dump(mode="json") for segment in translated_segments],
        )
        from backend.services.media_refs import create_media_ref

        output_ref = create_media_ref(
            str(saved_path),
            "application/x-subrip",
            role="output",
        )
        if output_ref is None:
            raise RuntimeError("Translation output reference could not be created")
        ctx.set_media(
            "subtitle_ref",
            output_ref,
            kind="subtitle",
        )
        
        logger.success(f"Step Translate finished. Saved to: {saved_path}")

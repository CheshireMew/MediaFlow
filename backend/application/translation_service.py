from typing import List, Optional

from loguru import logger

from backend.models.media_contracts import MediaReference, TaskArtifact, TaskResult
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.task_result_contracts import PipelineOutputs, TranslationOutput
from backend.models.translation_contracts import TranslationRequest
from backend.models.translation_target_language import (
    TranslationTargetLanguage,
    get_language_suffix,
    parse_translation_target_language,
)
from backend.services.generated_output_paths import build_suffixed_output_path
from backend.services.media_refs import create_media_ref
from backend.application.media_input import require_input_file


def _target_language_value(target_language: str | TranslationTargetLanguage) -> str:
    return parse_translation_target_language(target_language).value


def get_translation_output_suffix(target_language: str | TranslationTargetLanguage, mode: str) -> str:
    if mode == "proofread":
        return "_PR"
    return get_language_suffix(target_language)


def build_translation_task_result(
    segments: List[SubtitleSegment],
    *,
    target_language: str | TranslationTargetLanguage,
    mode: str,
    context_ref: Optional[MediaReference] = None,
) -> TaskResult:
    artifacts: list[TaskArtifact] = []
    target_language_value = _target_language_value(target_language)
    resolved_context_ref = context_ref

    if resolved_context_ref and segments:
        try:
            from backend.utils.subtitle_writer import SubtitleWriter

            suffix = get_translation_output_suffix(target_language_value, mode)
            save_path = build_suffixed_output_path(
                resolved_context_ref.path,
                suffix,
                extension=".srt",
            )

            logger.debug(
                f"[Translate] Saving translated subtitles: source={resolved_context_ref.path}, "
                f"target={save_path}"
            )

            saved_path = SubtitleWriter.save_srt(segments, str(save_path))
            output_ref = create_media_ref(
                str(saved_path),
                "application/x-subrip",
                role="output",
            )
            if output_ref:
                artifacts.append(
                    TaskArtifact(kind="subtitle", role="output", ref=output_ref)
                )
        except Exception as exc:
            logger.error(f"Failed to save translated SRT: {exc}")

    return TaskResult(
        success=True,
        artifacts=artifacts,
        outputs=PipelineOutputs(
            translation=TranslationOutput(
                segments=segments,
                language=target_language_value,
                mode=mode,
            )
        ),
    )


def build_translation_worker_kwargs(
    req: TranslationRequest,
    *,
    progress_callback=None,
    cancel_check=None,
) -> dict:
    kwargs = {
        "segments": req.segments,
        "target_language": req.target_language.value,
        "mode": req.mode,
        "batch_size": req.batch_size,
    }
    if progress_callback is not None:
        kwargs["progress_callback"] = progress_callback
    if cancel_check is not None:
        kwargs["cancel_check"] = cancel_check
    return kwargs


def _translation_immediate(
    req: TranslationRequest,
    *,
    llm_translator,
    progress_callback=None,
):
    translated_segments = llm_translator.translate_segments(
        **build_translation_worker_kwargs(
            req,
            progress_callback=progress_callback,
        )
    )
    result = build_translation_task_result(
        translated_segments,
        target_language=req.target_language.value,
        mode=req.mode,
        context_ref=req.context_ref,
    )
    output_artifact = next(
        (artifact for artifact in result.artifacts if artifact.kind == "subtitle"),
        None,
    )
    output_ref = (
        output_artifact.ref.model_dump(mode="json")
        if output_artifact is not None
        else None
    )
    translation_output = result.outputs.translation
    if translation_output is None:
        raise RuntimeError("Translation result did not publish translation output")
    return {
        "status": "completed",
        "segments": translation_output.segments,
        "language": translation_output.language.value,
        "context_ref": (
            req.context_ref.model_dump(mode="json") if req.context_ref else None
        ),
        "subtitle_ref": output_ref,
        "mode": translation_output.mode,
    }


class TranslationApplicationService:
    def __init__(self, llm_translator):
        self._llm_translator = llm_translator

    async def translate_immediate(
        self,
        request: TranslationRequest,
        *,
        progress_callback=None,
    ) -> dict:
        import asyncio

        if request.context_ref:
            require_input_file(request.context_ref.path, label="context_ref.path")
        return await asyncio.to_thread(
            _translation_immediate,
            request,
            llm_translator=self._llm_translator,
            progress_callback=progress_callback,
        )

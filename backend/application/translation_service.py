from typing import List, Optional

from loguru import logger

from backend.core.task_runtime import TaskRuntimeContext
from backend.models.schemas import (
    MediaReference,
    SubtitleSegment,
    TaskArtifact,
    TaskResult,
    TranslationRequest,
)
from backend.models.translation_target_language import (
    TranslationTargetLanguage,
    get_language_suffix,
    parse_translation_target_language,
)
from backend.services.generated_output_paths import build_suffixed_output_path
from backend.services.media_refs import create_media_ref


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
    meta = {
        "segments": [seg.model_dump(mode="json") for seg in segments],
        "language": target_language_value,
    }
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

    return TaskResult(success=True, artifacts=artifacts, meta=meta)


async def _translation_background(
    task_id: str,
    req: TranslationRequest,
    *,
    llm_translator,
    task_manager,
    background_runner,
) -> None:
    runtime = TaskRuntimeContext(task_id, task_manager=task_manager)

    await background_runner.run(
        task_id=task_id,
        worker_fn=llm_translator.translate_segments,
        worker_kwargs={
            "segments": req.segments,
            "target_language": req.target_language,
            "mode": req.mode,
            "batch_size": 10,
            "cancel_check": runtime.checkpoint,
        },
        start_message_code="translation_starting",
        success_message_code="translation_completed",
        result_transformer=lambda segments: build_translation_task_result(
            segments,
            target_language=req.target_language.value,
            mode=req.mode,
            context_ref=req.context_ref,
        ).model_dump(mode="json"),
    )


def _translation_immediate(
    req: TranslationRequest,
    *,
    llm_translator,
    progress_callback=None,
):
    translated_segments = llm_translator.translate_segments(
        segments=req.segments,
        target_language=req.target_language.value,
        mode=req.mode,
        batch_size=10,
        progress_callback=progress_callback,
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
    return {
        "segments": result.meta.get("segments", []),
        "language": req.target_language.value,
        "context_ref": (
            req.context_ref.model_dump(mode="json") if req.context_ref else None
        ),
        "subtitle_ref": output_ref,
        "output_ref": output_ref,
        "mode": req.mode,
    }

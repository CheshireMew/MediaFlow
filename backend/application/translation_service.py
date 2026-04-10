from pathlib import Path
from typing import List, Optional

from loguru import logger
from pydantic import BaseModel

from backend.core.runtime_access import RuntimeServices, TaskRuntimeContext
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import FileRef, MediaReference, SubtitleSegment, TaskResult
from backend.services.media_refs import create_media_ref
from backend.utils.media_inputs import MediaInputModel


LANGUAGE_SUFFIX_MAP = {
    "Chinese": "_CN",
    "English": "_EN",
    "Japanese": "_JP",
    "Spanish": "_ES",
    "French": "_FR",
    "German": "_DE",
    "Russian": "_RU",
}


def get_language_suffix(target_language: str) -> str:
    return LANGUAGE_SUFFIX_MAP.get(target_language, f"_{target_language}")


def get_translation_output_suffix(target_language: str, mode: str) -> str:
    if mode == "proofread":
        return "_PR"
    return get_language_suffix(target_language)


class TranslationRequest(MediaInputModel):
    MEDIA_INPUT_SPECS = (("context_path", "context_ref"),)
    segments: List[SubtitleSegment]
    target_language: str = "Chinese"
    mode: str = "standard"
    context_path: Optional[str] = None
    context_ref: Optional[MediaReference] = None


def build_translation_task_result(
    segments: List[SubtitleSegment],
    *,
    target_language: str,
    mode: str,
    context_path: Optional[str] = None,
    context_ref: Optional[MediaReference] = None,
) -> TaskResult:
    files: list[FileRef] = []
    meta = {
        "segments": [seg.model_dump(mode="json") for seg in segments],
        "language": target_language,
    }
    resolved_context_ref = context_ref
    if not resolved_context_ref and context_path:
        resolved_context_ref = create_media_ref(
            context_path,
            "application/x-subrip",
            role="context",
        )
    if resolved_context_ref:
        meta["context_ref"] = resolved_context_ref

    if context_path and segments:
        try:
            from backend.utils.subtitle_manager import SubtitleManager

            suffix = get_translation_output_suffix(target_language, mode)
            source_path = Path(context_path)
            save_path = source_path.parent / f"{source_path.stem}{suffix}"

            logger.debug(
                f"[Translate] Saving translated subtitles: source={context_path}, "
                f"target={save_path}.srt"
            )

            saved_path = SubtitleManager.save_srt(segments, str(save_path))
            files.append(
                FileRef(type="subtitle", path=str(saved_path), label="translation")
            )
            meta["srt_path"] = str(saved_path)
            output_ref = create_media_ref(
                str(saved_path),
                "application/x-subrip",
                role="output",
            )
            if output_ref:
                meta["subtitle_ref"] = output_ref
                meta["output_ref"] = output_ref
        except Exception as exc:
            logger.error(f"Failed to save translated SRT: {exc}")

    return TaskResult(success=True, files=files, meta=meta)


async def run_translation_task(task_id: str, req: TranslationRequest) -> None:
    llm_translator = RuntimeServices.translator()
    runtime = TaskRuntimeContext.for_task(task_id)

    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=llm_translator.translate_segments,
        worker_kwargs={
            "segments": req.segments,
            "target_language": req.target_language,
            "mode": req.mode,
            "batch_size": 10,
            "cancel_check": runtime.checkpoint,
        },
        start_message="Starting translation...",
        success_message="Translation completed",
        result_transformer=lambda segments: build_translation_task_result(
            segments,
            target_language=req.target_language,
            mode=req.mode,
            context_path=req.context_path,
            context_ref=req.context_ref,
        ).model_dump(mode="json"),
    )


def execute_translation(
    req: TranslationRequest,
    *,
    progress_callback=None,
):
    translated_segments = RuntimeServices.translator().translate_segments(
        segments=req.segments,
        target_language=req.target_language,
        mode=req.mode,
        batch_size=10,
        progress_callback=progress_callback,
    )
    result = build_translation_task_result(
        translated_segments,
        target_language=req.target_language,
        mode=req.mode,
        context_path=req.context_path,
        context_ref=req.context_ref,
    )
    return {
        "segments": result.meta.get("segments", []),
        "language": req.target_language,
        "context_ref": result.meta.get("context_ref"),
        "subtitle_ref": result.meta.get("subtitle_ref"),
        "output_ref": result.meta.get("output_ref"),
        "mode": req.mode,
    }


async def submit_translation_task(req: TranslationRequest) -> dict:
    source_name = Path(req.context_path or "").name if req.context_path else "Subtitles"
    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="translate",
        task_name=f"{source_name} ({req.target_language})",
        request_params=req.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: run_translation_task(task_id, req),
    )

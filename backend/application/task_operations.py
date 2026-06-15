from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TYPE_CHECKING

from pydantic import BaseModel

from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.models.schemas import (
    CleanRequest,
    ClipExportRequest,
    EnhanceRequest,
    OCRExtractRequest,
    SynthesisRequest,
    TranscribeRequest,
    TranscribeSegmentRequest,
    TranslationRequest,
)

if TYPE_CHECKING:
    from backend.models.task_model import Task


TaskHandler = Callable[[str, Any], Awaitable[None]]
TaskExecutor = Callable[..., Any]


async def _run_transcription_background(task_id: str, request: TranscribeRequest) -> None:
    from backend.application.transcription_service import _transcription_background

    await _transcription_background(task_id, request)


async def _run_transcription_segment_background(
    task_id: str,
    request: TranscribeSegmentRequest,
) -> None:
    from backend.application.transcription_service import _transcription_segment_background

    await _transcription_segment_background(task_id, request)


async def _run_transcription_segment_immediate(
    request: TranscribeSegmentRequest,
    **kwargs,
):
    from backend.application.transcription_service import _transcription_segment_immediate

    return await _call_with_supported_kwargs(
        _transcription_segment_immediate,
        request,
        kwargs,
    )


async def _run_translation_background(task_id: str, request: TranslationRequest) -> None:
    from backend.application.translation_service import _translation_background

    await _translation_background(task_id, request)


def _run_translation_immediate(request: TranslationRequest, **kwargs):
    from backend.application.translation_service import _translation_immediate

    return _call_with_supported_kwargs(_translation_immediate, request, kwargs)


async def _run_synthesis_background(task_id: str, request: SynthesisRequest) -> None:
    from backend.application.synthesis_service import _synthesis_background

    await _synthesis_background(task_id, request)


async def _run_clip_export_background(task_id: str, request: ClipExportRequest) -> None:
    from backend.application.clip_export_task_service import _clip_export_background

    await _clip_export_background(task_id, request)


async def _run_ocr_background(task_id: str, request: OCRExtractRequest) -> None:
    from backend.application.ocr_service import _ocr_background

    await _ocr_background(task_id, request)


def _ensure_enhancement_request_available(request: EnhanceRequest) -> None:
    from backend.application.preprocessing_service import _ensure_enhancement_available

    _ensure_enhancement_available(request)


async def _run_enhancement_background(task_id: str, request: EnhanceRequest) -> None:
    from backend.application.preprocessing_service import _enhancement_background

    await _enhancement_background(task_id, request)


async def _run_cleanup_background(task_id: str, request: CleanRequest) -> None:
    from backend.application.preprocessing_service import _cleanup_background

    await _cleanup_background(task_id, request)


@dataclass(frozen=True)
class TaskOperation:
    task_type: str
    request_model: type[BaseModel]
    task_name: Callable[[Any], str]
    background: TaskHandler
    immediate: TaskExecutor | None = None
    before_queue: Callable[[Any], None] | None = None
    initial_message: Callable[[Any], str] | str = "Queued"
    queued_message: Callable[[Any], str] | str = "Queued"


def _message(value: Callable[[Any], str] | str, request: Any) -> str:
    return value(request) if callable(value) else value


def _call_with_supported_kwargs(callable_obj: TaskExecutor, request: Any, kwargs: dict[str, Any]):
    signature = inspect.signature(callable_obj)
    if any(param.kind is inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()):
        return callable_obj(request, **kwargs)
    supported = {key: value for key, value in kwargs.items() if key in signature.parameters}
    return callable_obj(request, **supported)


def _transcription_name(request: TranscribeRequest) -> str:
    return request.audio_ref.name or Path(request.audio_ref.path).name or "Audio"


def _translation_name(request: TranslationRequest) -> str:
    source_name = request.context_ref.name if request.context_ref else "Subtitles"
    return f"{source_name} ({request.target_language})"


def _synthesis_name(request: SynthesisRequest) -> str:
    return request.video_ref.name or Path(request.video_ref.path).name


def _clip_export_name(request: ClipExportRequest) -> str:
    source_name = request.video_ref.name or Path(request.video_ref.path).name
    return f"Export clips from {source_name}"


def _enhancement_name(request: EnhanceRequest) -> str:
    source = Path(request.video_ref.path)
    return f"Enhance {source.name} ({request.method} {request.scale})"


def _cleanup_name(request: CleanRequest) -> str:
    return f"Clean {Path(request.video_ref.path).name}"


OPERATIONS: dict[str, TaskOperation] = {
    "transcribe": TaskOperation(
        task_type="transcribe",
        request_model=TranscribeRequest,
        task_name=_transcription_name,
        background=_run_transcription_background,
    ),
    "transcribe_segment": TaskOperation(
        task_type="transcribe_segment",
        request_model=TranscribeSegmentRequest,
        task_name=lambda request: f"Segment {request.start}-{request.end}",
        background=_run_transcription_segment_background,
        immediate=_run_transcription_segment_immediate,
        initial_message="Queued (Long Segment)",
        queued_message="Queued (Long Segment)",
    ),
    "translate": TaskOperation(
        task_type="translate",
        request_model=TranslationRequest,
        task_name=_translation_name,
        background=_run_translation_background,
        immediate=_run_translation_immediate,
    ),
    "synthesis": TaskOperation(
        task_type="synthesis",
        request_model=SynthesisRequest,
        task_name=_synthesis_name,
        background=_run_synthesis_background,
    ),
    "clip_export": TaskOperation(
        task_type="clip_export",
        request_model=ClipExportRequest,
        task_name=_clip_export_name,
        background=_run_clip_export_background,
    ),
    "extract": TaskOperation(
        task_type="extract",
        request_model=OCRExtractRequest,
        task_name=lambda _request: "OCR Extraction",
        background=_run_ocr_background,
    ),
    "enhancement": TaskOperation(
        task_type="enhancement",
        request_model=EnhanceRequest,
        task_name=_enhancement_name,
        background=_run_enhancement_background,
        before_queue=_ensure_enhancement_request_available,
        initial_message=lambda request: f"Initializing {request.method}...",
        queued_message=lambda request: f"Initializing {request.method}...",
    ),
    "cleanup": TaskOperation(
        task_type="cleanup",
        request_model=CleanRequest,
        task_name=_cleanup_name,
        background=_run_cleanup_background,
        initial_message="Queued for Cleanup",
        queued_message="Queued for Cleanup",
    ),
}


def task_operation(task_type: str) -> TaskOperation:
    operation = OPERATIONS.get(task_type)
    if operation is None:
        raise ValueError(f"No task operation found for task type: {task_type}")
    return operation


def build_operation_runner(task: "Task"):
    operation = task_operation(task.type)
    request = operation.request_model.model_validate(task.request_params)
    return lambda: operation.background(task.id, request)


async def submit_task_operation(task_type: str, request: BaseModel) -> dict:
    operation = task_operation(task_type)
    typed_request = operation.request_model.model_validate(request)
    if operation.before_queue:
        operation.before_queue(typed_request)
    return await runtime_service(Services.TASK_ORCHESTRATOR).submit_task(
        task_type=operation.task_type,
        task_name=operation.task_name(typed_request),
        request_params=typed_request.model_dump(mode="json"),
        initial_message=_message(operation.initial_message, typed_request),
        queued_message=_message(operation.queued_message, typed_request),
    )


async def run_task_operation(
    task_type: str,
    request: BaseModel | dict[str, Any],
    *,
    progress_callback=None,
    task_id: str | None = None,
) -> Any:
    operation = task_operation(task_type)
    executor = operation.immediate
    if executor is None:
        raise ValueError(f"Task operation has no immediate executor: {task_type}")
    typed_request = operation.request_model.model_validate(request)
    result = _call_with_supported_kwargs(
        executor,
        typed_request,
        {"progress_callback": progress_callback, "task_id": task_id},
    )
    if inspect.isawaitable(result):
        return await result
    return result

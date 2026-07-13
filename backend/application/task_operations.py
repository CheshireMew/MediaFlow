from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, TYPE_CHECKING

from pydantic import BaseModel

from backend.core.task_runner import BackgroundTaskRunner
from backend.models.task_message import TaskMessageParams, TaskProgressCallback
from backend.models.schemas import (
    ClipExportRequest,
    SynthesisRequest,
    TranscribeRequest,
    TranscribeSegmentRequest,
    TranslationRequest,
)

if TYPE_CHECKING:
    from backend.models.task_model import Task


TaskHandler = Callable[[str, Any], Awaitable[None]]


class TaskExecutor(Protocol):
    def __call__(
        self,
        request: Any,
        *,
        progress_callback: TaskProgressCallback | None,
        task_id: str | None,
    ) -> Any: ...


@dataclass(frozen=True)
class TaskOperation:
    task_type: str
    request_model: type[BaseModel]
    task_name: Callable[[Any], str]
    background: TaskHandler | None
    immediate: TaskExecutor | None = None
    before_queue: Callable[[Any], None] | None = None
    initial_message_code: str = "queued"
    queued_message_code: str = "queued"
    message_params: Callable[[Any], TaskMessageParams] | TaskMessageParams | None = None


def _message_params(
    value: Callable[[Any], TaskMessageParams] | TaskMessageParams | None,
    request: Any,
) -> TaskMessageParams:
    if value is None:
        return {}
    return value(request) if callable(value) else dict(value)


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


class TaskOperationExecutor:
    """Builds task runners from concrete media-processing dependencies."""

    def __init__(
        self,
        *,
        task_manager,
        asr_service,
        llm_translator,
        video_synthesis,
    ) -> None:
        self._task_manager = task_manager
        self._asr_service = asr_service
        self._llm_translator = llm_translator
        self._video_synthesis = video_synthesis
        self._background_runner = BackgroundTaskRunner(task_manager)
        self._operations = self._build_operations()

    def _build_operations(self) -> dict[str, TaskOperation]:
        return {
            "transcribe": TaskOperation(
                task_type="transcribe",
                request_model=TranscribeRequest,
                task_name=_transcription_name,
                background=self._run_transcription_background,
            ),
            "transcribe_segment": TaskOperation(
                task_type="transcribe_segment",
                request_model=TranscribeSegmentRequest,
                task_name=lambda request: f"Segment {request.start}-{request.end}",
                background=None,
                immediate=self._run_transcription_segment_immediate,
            ),
            "translate": TaskOperation(
                task_type="translate",
                request_model=TranslationRequest,
                task_name=_translation_name,
                background=self._run_translation_background,
                immediate=self._run_translation_immediate,
            ),
            "synthesis": TaskOperation(
                task_type="synthesis",
                request_model=SynthesisRequest,
                task_name=_synthesis_name,
                background=self._run_synthesis_background,
            ),
            "clip_export": TaskOperation(
                task_type="clip_export",
                request_model=ClipExportRequest,
                task_name=_clip_export_name,
                background=self._run_clip_export_background,
            ),
        }

    def task_operation(self, task_type: str) -> TaskOperation:
        operation = self._operations.get(task_type)
        if operation is None:
            raise ValueError(f"No task operation found for task type: {task_type}")
        return operation

    def build_runner(self, task: "Task"):
        operation = self.task_operation(task.type)
        if operation.background is None:
            raise ValueError(f"Task operation cannot run in the background: {task.type}")
        request = operation.request_model.model_validate(task.request_params)
        return lambda: operation.background(task.id, request)

    async def run_immediate(
        self,
        task_type: str,
        request: BaseModel | dict[str, Any],
        *,
        progress_callback=None,
        task_id: str | None = None,
    ) -> Any:
        operation = self.task_operation(task_type)
        executor = operation.immediate
        if executor is None:
            raise ValueError(f"Task operation has no immediate executor: {task_type}")
        typed_request = operation.request_model.model_validate(request)
        result = executor(
            typed_request,
            progress_callback=progress_callback,
            task_id=task_id,
        )
        if inspect.isawaitable(result):
            return await result
        return result

    async def _run_transcription_background(self, task_id, request) -> None:
        from backend.application.transcription_service import _transcription_background

        await _transcription_background(
            task_id,
            request,
            asr_service=self._asr_service,
            background_runner=self._background_runner,
        )

    async def _run_transcription_segment_immediate(
        self,
        request,
        *,
        progress_callback=None,
        task_id=None,
    ):
        from backend.application.transcription_service import _transcription_segment_immediate

        return await _transcription_segment_immediate(
            request,
            asr_service=self._asr_service,
            progress_callback=progress_callback,
            task_id=task_id,
        )

    async def _run_translation_background(self, task_id, request) -> None:
        from backend.application.translation_service import _translation_background

        await _translation_background(
            task_id,
            request,
            llm_translator=self._llm_translator,
            task_manager=self._task_manager,
            background_runner=self._background_runner,
        )

    async def _run_translation_immediate(
        self,
        request,
        *,
        progress_callback=None,
        task_id=None,
    ):
        from backend.application.translation_service import _translation_immediate

        import asyncio

        return await asyncio.to_thread(
            _translation_immediate,
            request,
            llm_translator=self._llm_translator,
            progress_callback=progress_callback,
        )

    async def _run_synthesis_background(self, task_id, request) -> None:
        from backend.application.synthesis_service import _synthesis_background

        await _synthesis_background(
            task_id,
            request,
            video_synthesis=self._video_synthesis,
            background_runner=self._background_runner,
        )

    async def _run_clip_export_background(self, task_id, request) -> None:
        from backend.application.clip_export_task_service import _clip_export_background

        await _clip_export_background(
            task_id,
            request,
            video_synthesis=self._video_synthesis,
            background_runner=self._background_runner,
        )

class TaskOperationService:
    """API-facing task use case with explicit executor and orchestrator dependencies."""

    def __init__(self, *, executor: TaskOperationExecutor, orchestrator) -> None:
        self._executor = executor
        self._orchestrator = orchestrator

    async def submit(self, task_type: str, request: BaseModel) -> dict:
        operation = self._executor.task_operation(task_type)
        if operation.background is None:
            raise ValueError(f"Task operation cannot be submitted: {task_type}")
        typed_request = operation.request_model.model_validate(request)
        if operation.before_queue:
            operation.before_queue(typed_request)
        return await self._orchestrator.submit_task(
            task_type=operation.task_type,
            task_name=operation.task_name(typed_request),
            request_params=typed_request.model_dump(mode="json"),
            initial_message_code=operation.initial_message_code,
            initial_message_params=_message_params(operation.message_params, typed_request),
            queued_message_code=operation.queued_message_code,
            queued_message_params=_message_params(operation.message_params, typed_request),
        )

    async def run(
        self,
        task_type: str,
        request: BaseModel | dict[str, Any],
        *,
        progress_callback=None,
        task_id: str | None = None,
    ) -> Any:
        return await self._executor.run_immediate(
            task_type,
            request,
            progress_callback=progress_callback,
            task_id=task_id,
        )

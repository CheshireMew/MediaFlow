from typing import Protocol

from backend.models.media_contracts import TaskResult
from backend.models.transcription_contracts import TranscribeRequest, TranscribeSegmentRequest, TranscriptionEngine
from backend.models.task_message import TaskProgressCallback
from backend.application.media_input import require_input_file
from backend.models.application_errors import InvalidInputError


class ASRServiceProtocol(Protocol):
    def transcribe(
        self,
        *,
        audio_path: str,
        model_name: str,
        device: str,
        engine: TranscriptionEngine,
        language: str | None,
        vad_filter: bool,
        task_id: str | None,
        initial_prompt: str | None,
        progress_callback: TaskProgressCallback | None,
    ) -> TaskResult: ...

    def transcribe_segment(
        self,
        *,
        audio_path: str,
        start: float,
        end: float,
        model_name: str,
        device: str,
        engine: TranscriptionEngine,
        language: str | None,
        vad_filter: bool,
        task_id: str | None,
        initial_prompt: str | None,
        progress_callback: TaskProgressCallback | None,
    ) -> TaskResult: ...


def build_transcription_worker_kwargs(
    req: TranscribeRequest,
    *,
    task_id: str | None,
    progress_callback: TaskProgressCallback | None = None,
) -> dict:
    return {
        "audio_path": req.audio_ref.path,
        "model_name": req.model,
        "device": req.device,
        "engine": req.engine,
        "language": req.language,
        "vad_filter": req.vad_filter,
        "task_id": task_id,
        "initial_prompt": req.initial_prompt,
        "progress_callback": progress_callback,
    }

async def _transcription_segment_immediate(
    req: TranscribeSegmentRequest,
    *,
    asr_service: ASRServiceProtocol,
    task_id: str | None,
    progress_callback: TaskProgressCallback | None,
) -> dict:
    import asyncio
    from functools import partial

    loop = asyncio.get_running_loop()
    func = partial(
        asr_service.transcribe_segment,
        **build_transcription_worker_kwargs(
            req,
            task_id=task_id,
            progress_callback=progress_callback,
        ),
        start=req.start,
        end=req.end,
    )
    result = await loop.run_in_executor(None, func)
    if not result.success:
        raise RuntimeError(result.error or "Segment transcription failed")
    transcription_output = result.outputs.transcription
    if transcription_output is None:
        raise RuntimeError("Transcription result did not publish transcription output")
    return {
        "status": "completed",
        "data": {
            "text": transcription_output.text,
            "segments": transcription_output.segments,
        },
    }


class TranscriptionApplicationService:
    def __init__(self, asr_service: ASRServiceProtocol):
        self._asr_service = asr_service

    async def transcribe_segment(
        self,
        request: TranscribeSegmentRequest,
        *,
        task_id: str | None = None,
        progress_callback: TaskProgressCallback | None = None,
    ) -> dict:
        if request.end <= request.start:
            raise InvalidInputError(
                "Invalid duration",
                code="invalid_transcription_duration",
            )
        require_input_file(request.audio_ref.path, label="audio_ref.path")
        return await _transcription_segment_immediate(
            request,
            asr_service=self._asr_service,
            task_id=task_id,
            progress_callback=progress_callback,
        )

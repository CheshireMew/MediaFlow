from typing import Protocol

from backend.models.schemas import (
    TaskResult,
    TranscribeRequest,
    TranscribeSegmentRequest,
    TranscriptionEngine,
)
from backend.models.task_message import TaskProgressCallback


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

async def _transcription_background(
    task_id: str,
    req: TranscribeRequest,
    *,
    asr_service: ASRServiceProtocol,
    background_runner,
):
    await background_runner.run(
        task_id=task_id,
        worker_fn=asr_service.transcribe,
        worker_kwargs=build_transcription_worker_kwargs(req, task_id=task_id),
        start_message_code="transcription_starting",
        success_message_code="transcription_completed",
    )


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
    return {
        "status": "completed",
        "data": result.meta,
    }

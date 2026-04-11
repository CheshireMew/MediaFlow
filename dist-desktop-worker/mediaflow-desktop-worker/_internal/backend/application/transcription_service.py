import inspect
from pathlib import Path

from backend.core.runtime_access import RuntimeServices
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import TranscribeRequest
from backend.services.media_refs import create_media_ref


def supported_kwargs(callable_obj, kwargs: dict):
    signature = inspect.signature(callable_obj)
    if any(param.kind is inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()):
        return kwargs
    return {key: value for key, value in kwargs.items() if key in signature.parameters}


async def run_transcription_task(task_id: str, req: TranscribeRequest):
    asr_service = RuntimeServices.asr()
    worker_kwargs = supported_kwargs(
        asr_service.transcribe,
        {
            "audio_path": req.audio_path,
            "model_name": req.model,
            "device": req.device,
            "engine": req.engine,
            "language": req.language,
            "task_id": task_id,
            "initial_prompt": req.initial_prompt,
        },
    )
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=asr_service.transcribe,
        worker_kwargs=worker_kwargs,
        start_message="Starting transcription...",
        success_message="Transcribed successfully",
    )


def execute_transcription(
    req: TranscribeRequest,
    *,
    progress_callback=None,
    task_id: str | None = None,
):
    asr_service = RuntimeServices.asr()
    worker_kwargs = supported_kwargs(
        asr_service.transcribe,
        {
            "audio_path": req.audio_path,
            "model_name": req.model,
            "device": req.device,
            "engine": req.engine,
            "language": req.language,
            "task_id": task_id,
            "initial_prompt": req.initial_prompt,
            "progress_callback": progress_callback,
        },
    )
    result = asr_service.transcribe(**worker_kwargs)
    if not result.success:
        raise RuntimeError(result.error or "Transcription failed")

    video_ref = req.audio_ref or create_media_ref(req.audio_path, role="source")
    subtitle_ref = result.meta.get("subtitle_ref") or result.meta.get("output_ref")
    return {
        "segments": result.meta.get("segments", []),
        "text": result.meta.get("text", ""),
        "language": result.meta.get("language", req.language or "auto"),
        "video_ref": video_ref,
        "subtitle_ref": subtitle_ref,
        "output_ref": result.meta.get("output_ref") or subtitle_ref,
    }


async def submit_transcription_task(req: TranscribeRequest) -> dict:
    filename = Path(req.audio_path or "").name or "Audio"
    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="transcribe",
        task_name=filename,
        request_params=req.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: run_transcription_task(task_id, req),
    )


async def submit_transcription_segment_task(req) -> dict:
    asr_service = RuntimeServices.asr()
    worker_kwargs = supported_kwargs(
        asr_service.transcribe_segment,
        {
            "audio_path": req.audio_path,
            "start": req.start,
            "end": req.end,
            "model_name": req.model,
            "device": req.device,
            "engine": req.engine,
            "language": req.language,
            "task_id": None,
        },
    )
    return await RuntimeServices.task_orchestrator().submit_task(
        task_type="transcribe_segment",
        task_name=f"Segment {req.start}-{req.end}",
        initial_message="Queued (Long Segment)",
        queued_message="Queued (Long Segment)",
        request_params=req.model_dump(mode="json"),
        runner_factory=lambda task_id: lambda: BackgroundTaskRunner.run(
            task_id=task_id,
            worker_fn=asr_service.transcribe_segment,
            worker_kwargs={**worker_kwargs, "task_id": task_id} if "task_id" in worker_kwargs else worker_kwargs,
            start_message="Processing segment...",
            success_message="Segment transcribed",
        ),
    )


async def execute_transcription_segment(req) -> dict:
    import asyncio
    from functools import partial

    loop = asyncio.get_running_loop()
    service = RuntimeServices.asr()
    func = partial(
        service.transcribe_segment,
        **supported_kwargs(
            service.transcribe_segment,
            {
                "audio_path": req.audio_path,
                "start": req.start,
                "end": req.end,
                "model_name": req.model,
                "device": req.device,
                "language": req.language,
                "engine": req.engine,
            },
        ),
    )
    result = await loop.run_in_executor(None, func)
    if not result.success:
        raise RuntimeError(result.error or "Segment transcription failed")
    return {
        "status": "completed",
        "data": result.meta,
    }

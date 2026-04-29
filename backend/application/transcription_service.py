import inspect
from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.core.task_runner import BackgroundTaskRunner
from backend.models.schemas import TranscribeRequest


def supported_kwargs(callable_obj, kwargs: dict):
    signature = inspect.signature(callable_obj)
    if any(param.kind is inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()):
        return kwargs
    return {key: value for key, value in kwargs.items() if key in signature.parameters}


async def _transcription_background(task_id: str, req: TranscribeRequest):
    asr_service = runtime_service(Services.ASR)
    audio_path = req.audio_ref.path
    worker_kwargs = supported_kwargs(
        asr_service.transcribe,
        {
            "audio_path": audio_path,
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


def _transcription_desktop(
    req: TranscribeRequest,
    *,
    progress_callback=None,
    task_id: str | None = None,
):
    asr_service = runtime_service(Services.ASR)
    audio_path = req.audio_ref.path
    worker_kwargs = supported_kwargs(
        asr_service.transcribe,
        {
            "audio_path": audio_path,
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

    video_ref = req.audio_ref
    subtitle_ref = result.meta.get("subtitle_ref") or result.meta.get("output_ref")
    return {
        "segments": result.meta.get("segments", []),
        "text": result.meta.get("text", ""),
        "language": result.meta.get("language", req.language or "auto"),
        "video_ref": video_ref,
        "subtitle_ref": subtitle_ref,
        "output_ref": result.meta.get("output_ref") or subtitle_ref,
    }


async def _transcription_segment_background(task_id: str, req) -> None:
    asr_service = runtime_service(Services.ASR)
    audio_path = req.audio_ref.path
    worker_kwargs = supported_kwargs(
        asr_service.transcribe_segment,
        {
            "audio_path": audio_path,
            "start": req.start,
            "end": req.end,
            "model_name": req.model,
            "device": req.device,
            "engine": req.engine,
            "language": req.language,
            "task_id": task_id,
        },
    )
    await BackgroundTaskRunner.run(
        task_id=task_id,
        worker_fn=asr_service.transcribe_segment,
        worker_kwargs=worker_kwargs,
        start_message="Processing segment...",
        success_message="Segment transcribed",
    )


async def _transcription_segment_immediate(req) -> dict:
    import asyncio
    from functools import partial

    loop = asyncio.get_running_loop()
    service = runtime_service(Services.ASR)
    audio_path = req.audio_ref.path
    func = partial(
        service.transcribe_segment,
        **supported_kwargs(
            service.transcribe_segment,
            {
                "audio_path": audio_path,
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

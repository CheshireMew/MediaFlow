from pathlib import Path
from typing import Any

from backend.application.synthesis_service import execute_synthesis
from backend.application.transcription_service import execute_transcription
from backend.application.translation_service import TranslationRequest, execute_translation
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit


@register_worker_command("transcribe")
def handle_transcribe(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.models.schemas import TranscribeRequest

    request = TranscribeRequest.model_validate(payload)
    if not request.audio_path:
        raise ValueError("audio_path or audio_ref is required")

    def progress_callback(progress: int, message: str) -> None:
        emit({
            "type": "event",
            "event": "progress",
            "id": request_id,
            "payload": {
                "progress": progress,
                "message": message,
            },
        })

    result = execute_transcription(
        request,
        progress_callback=progress_callback,
        task_id=f"desktop-{request_id}",
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("translate")
def handle_translate(request_id: str | None, payload: dict[str, Any]) -> None:
    request = TranslationRequest.model_validate(payload)

    def progress_callback(progress: int, message: str) -> None:
        emit({
            "type": "event",
            "event": "translate_progress",
            "id": request_id,
            "payload": {
                "progress": progress,
                "message": message,
            },
        })

    result = execute_translation(
        request,
        progress_callback=progress_callback,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })


@register_worker_command("synthesize")
def handle_synthesize(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.models.schemas import SynthesisRequest

    request = SynthesisRequest.model_validate(payload)
    if not request.video_path:
        raise ValueError("video_path or video_ref is required")
    if not request.srt_path:
        raise ValueError("srt_path or srt_ref is required")

    if not request.output_path:
        source = Path(request.video_path)
        request.output_path = str(source.with_name(f"{source.stem}_burned{source.suffix}"))

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "synthesize_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    result = execute_synthesis(request, progress_callback=progress_callback)

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })

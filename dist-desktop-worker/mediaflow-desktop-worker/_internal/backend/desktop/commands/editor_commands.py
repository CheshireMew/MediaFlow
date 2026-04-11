import base64
import os
import shutil
from pathlib import Path
from typing import Any

from backend.config import settings
from backend.core.runtime_access import RuntimeServices
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit
from backend.models.schemas import SubtitleSegment, TranscribeSegmentRequest


@register_worker_command("detect_silence")
def handle_detect_silence(request_id: str | None, payload: dict[str, Any]) -> None:
    from backend.utils.audio_processor import AudioProcessor

    file_path = payload["file_path"]
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    intervals = AudioProcessor.detect_silence(
        file_path,
        silence_thresh=str(payload.get("threshold") or "-30dB"),
        min_silence_dur=float(payload.get("min_duration") or 0.5),
    )
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "silence_intervals": intervals,
        },
    })

@register_worker_command("transcribe_segment")
def handle_transcribe_segment(request_id: str | None, payload: dict[str, Any]) -> None:
    request = TranscribeSegmentRequest.model_validate(payload)
    if not request.audio_path:
        raise ValueError("audio_path or audio_ref is required")
    duration = request.end - request.start
    if duration <= 0:
        raise ValueError("Invalid duration")

    service = RuntimeServices.asr()
    result = service.transcribe_segment(
        audio_path=request.audio_path,
        start=request.start,
        end=request.end,
        model_name=request.model,
        device=request.device,
        language=request.language,
        engine=request.engine,
    )
    if not result.success:
        raise RuntimeError(result.error or "Segment transcription failed")

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "status": "completed",
            "data": result.meta,
        },
    })


@register_worker_command("translate_segment")
def handle_translate_segment(request_id: str | None, payload: dict[str, Any]) -> None:
    translator = RuntimeServices.translator()
    segments = [SubtitleSegment.model_validate(seg) for seg in payload["segments"]]
    translated = translator.translate_segments(
        segments=segments,
        target_language=payload.get("target_language", "Chinese"),
        mode=payload.get("mode", "standard"),
        batch_size=max(1, len(segments)),
    )
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "task_id": "sync_translation",
            "status": "completed",
            "segments": [seg.model_dump(mode="json") for seg in translated],
        },
    })


@register_worker_command("upload_watermark")
def handle_upload_watermark(request_id: str | None, payload: dict[str, Any]) -> None:
    input_path = payload["file_path"]
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    watermarks_dir = settings.USER_DATA_DIR / "watermarks"
    watermarks_dir.mkdir(parents=True, exist_ok=True)

    temp_input_path = settings.WORKSPACE_DIR / f"{Path(input_path).stem}_{request_id}{Path(input_path).suffix}"
    shutil.copyfile(input_path, temp_input_path)

    try:
        png_path = RuntimeServices.video_synthesizer().process_watermark(str(temp_input_path))
        persistent_path = watermarks_dir / "latest.png"
        shutil.move(png_path, persistent_path)

        from PIL import Image

        with Image.open(persistent_path) as img:
            width, height = img.size

        with open(persistent_path, "rb") as file:
            b64_data = base64.b64encode(file.read()).decode("utf-8")

        emit({
            "type": "response",
            "id": request_id,
            "ok": True,
            "result": {
                "png_path": str(persistent_path),
                "data_url": f"data:image/png;base64,{b64_data}",
                "width": width,
                "height": height,
            },
        })
    finally:
        try:
            if temp_input_path.exists():
                temp_input_path.unlink()
        except Exception:
            pass


@register_worker_command("get_latest_watermark")
def handle_get_latest_watermark(request_id: str | None, _payload: dict[str, Any]) -> None:
    persistent_path = settings.USER_DATA_DIR / "watermarks" / "latest.png"
    if not persistent_path.exists():
        emit({
            "type": "response",
            "id": request_id,
            "ok": True,
            "result": None,
        })
        return

    from PIL import Image

    with Image.open(persistent_path) as img:
        width, height = img.size

    with open(persistent_path, "rb") as file:
        b64_data = base64.b64encode(file.read()).decode("utf-8")

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "png_path": str(persistent_path),
            "data_url": f"data:image/png;base64,{b64_data}",
            "width": width,
            "height": height,
        },
    })

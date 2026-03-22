import json
import asyncio
import subprocess
import sys
import traceback
import os
import base64
import shutil
from importlib import import_module
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from loguru import logger

from backend.config import settings
from backend.models.schemas import SubtitleSegment, FileRef
from backend.services.settings_manager import LLMProvider, UserSettings
from backend.core.container import container, Services
from backend.core.service_registry import register_all_services
from backend.core.tasks.registry import (
    register_all_task_handlers,
    validate_required_task_handlers,
)
from backend.services.media_refs import create_media_ref

WORKER_PREFIX = "__MEDIAFLOW_WORKER__"
DESKTOP_WORKER_PROTOCOL_VERSION = 1
_RAPID_OCR_ENGINE = None
_PADDLE_OCR_ENGINE = None


def configure_worker_stdio() -> None:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfigure):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    reconfigure_err = getattr(sys.stderr, "reconfigure", None)
    if callable(reconfigure_err):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def configure_worker_logging() -> None:
    logger.remove()

    log_format = (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
        "{level:<8} | "
        "{name}:{function}:{line} - {message}"
    )

    logger.add(
        sys.stdout,
        level="DEBUG",
        format=log_format,
        enqueue=False,
        backtrace=False,
        diagnose=False,
        filter=lambda record: record["level"].no < 40,
    )
    logger.add(
        sys.stderr,
        level="ERROR",
        format=log_format,
        enqueue=False,
        backtrace=True,
        diagnose=False,
    )


def bootstrap_worker() -> None:
    settings.init_dirs()
    register_all_services()
    register_all_task_handlers()
    validate_required_task_handlers()


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(f"{WORKER_PREFIX}{json.dumps(payload, ensure_ascii=False)}\n")
    sys.stdout.flush()


def emit_error(request_id: str | None, error: str) -> None:
    emit({
        "type": "response",
        "id": request_id,
        "ok": False,
        "error": error,
    })


def get_settings_manager():
    return container.get(Services.SETTINGS_MANAGER)


def get_glossary_service():
    return container.get(Services.GLOSSARY)


def get_ocr_engine(engine_type: str = "rapid"):
    from backend.services.ocr.ocr_engine import PaddleOCREngine, RapidOCREngine
    global _RAPID_OCR_ENGINE, _PADDLE_OCR_ENGINE

    if engine_type == "paddle":
        if _PADDLE_OCR_ENGINE is None:
            _PADDLE_OCR_ENGINE = PaddleOCREngine()
        return _PADDLE_OCR_ENGINE

    if _RAPID_OCR_ENGINE is None:
        _RAPID_OCR_ENGINE = RapidOCREngine()
    return _RAPID_OCR_ENGINE


def get_yt_dlp_version() -> str | None:
    try:
        yt_dlp = import_module("yt_dlp")
        version = getattr(getattr(yt_dlp, "version", None), "__version__", None)
        if version:
            return str(version)
    except Exception:
        return None
    return None


def handle_transcribe(request_id: str, payload: dict[str, Any]) -> None:
    audio_path = payload.get("audio_path") or (payload.get("audio_ref") or {}).get("path")
    if not audio_path:
        raise ValueError("audio_path or audio_ref is required")
    model = payload.get("model", "base")
    device = payload.get("device", "cpu")
    language = payload.get("language")
    initial_prompt = payload.get("initial_prompt")

    from backend.services.asr import ASRService
    service = ASRService()

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

    result = service.transcribe(
        audio_path=audio_path,
        model_name=model,
        device=device,
        language=language,
        initial_prompt=initial_prompt,
        task_id=f"desktop-{request_id}",
        progress_callback=progress_callback,
    )

    if not result.success:
        raise RuntimeError(result.error or "Transcription failed")

    video_ref = payload.get("audio_ref")
    if not video_ref and audio_path:
        video_ref = create_media_ref(audio_path, role="source")
    subtitle_ref = result.meta.get("subtitle_ref") or result.meta.get("output_ref")

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "segments": result.meta.get("segments", []),
            "text": result.meta.get("text", ""),
            "language": result.meta.get("language", language or "auto"),
            "video_ref": video_ref,
            "subtitle_ref": subtitle_ref,
            "output_ref": result.meta.get("output_ref") or subtitle_ref,
        },
    })


def handle_translate(request_id: str, payload: dict[str, Any]) -> None:
    from backend.application.translation_service import TranslationRequest, build_translation_task_result
    from backend.services.translator.llm_translator import LLMTranslator
    context_path = payload.get("context_path") or (payload.get("context_ref") or {}).get("path")
    if context_path:
        payload = {**payload, "context_path": context_path}
    translator = LLMTranslator()
    request = TranslationRequest.model_validate(payload)
    segments = request.segments

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

    translated_segments = translator.translate_segments(
        segments=segments,
        target_language=request.target_language,
        mode=request.mode,
        batch_size=10,
        progress_callback=progress_callback,
    )

    result = build_translation_task_result(
        translated_segments,
        target_language=request.target_language,
        mode=request.mode,
        context_path=request.context_path,
        context_ref=request.context_ref,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "segments": result.meta.get("segments", []),
            "language": request.target_language,
            "context_ref": result.meta.get("context_ref"),
            "subtitle_ref": result.meta.get("subtitle_ref"),
            "output_ref": result.meta.get("output_ref"),
            "mode": request.mode,
        },
    })


def handle_synthesize(request_id: str, payload: dict[str, Any]) -> None:
    video_path = payload.get("video_path") or (payload.get("video_ref") or {}).get("path")
    srt_path = payload.get("srt_path") or (payload.get("srt_ref") or {}).get("path")
    if not video_path:
        raise ValueError("video_path or video_ref is required")
    if not srt_path:
        raise ValueError("srt_path or srt_ref is required")
    watermark_path = payload.get("watermark_path")
    output_path = payload.get("output_path")
    options = payload.get("options") or {}

    if not output_path:
        source = Path(video_path)
        output_path = str(source.with_name(f"{source.stem}_burned{source.suffix}"))

    from backend.services.video_synthesizer import VideoSynthesizer
    synthesizer = VideoSynthesizer()

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

    final_path = synthesizer.burn_in_subtitles(
        video_path=video_path,
        srt_path=srt_path,
        output_path=output_path,
        watermark_path=watermark_path,
        options=options,
        progress_callback=progress_callback,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "video_path": final_path,
            "output_path": final_path,
            "video_ref": create_media_ref(final_path, "video/mp4", role="output"),
            "output_ref": create_media_ref(final_path, "video/mp4", role="output"),
            "context_ref": payload.get("srt_ref"),
            "subtitle_ref": payload.get("srt_ref"),
        },
    })


def handle_get_settings(request_id: str) -> None:
    settings = get_settings_manager().get_settings()
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": settings.model_dump(mode="json"),
    })


def handle_update_settings(request_id: str, payload: dict[str, Any]) -> None:
    settings = UserSettings.model_validate(payload["settings"])
    manager = get_settings_manager()
    manager.update_settings(settings)
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": manager.get_settings().model_dump(mode="json"),
    })


def handle_set_active_provider(request_id: str, payload: dict[str, Any]) -> None:
    provider_id = payload["provider_id"]
    manager = get_settings_manager()
    manager.set_active_provider(provider_id)
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "status": "success",
            "active_provider_id": provider_id,
        },
    })


def handle_test_provider(request_id: str, payload: dict[str, Any]) -> None:
    from openai import OpenAI

    provider = LLMProvider(
        id="test-provider",
        name=payload.get("name") or "Test Provider",
        base_url=payload["base_url"],
        api_key=payload["api_key"],
        model=payload["model"],
        is_active=False,
    )
    client = OpenAI(
        api_key=provider.api_key,
        base_url=provider.base_url,
        timeout=15.0,
    )
    client.chat.completions.create(
        model=provider.model,
        messages=[{"role": "user", "content": "Reply with OK."}],
        max_tokens=3,
    )
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "status": "success",
            "message": "Connection successful",
        },
    })


def handle_glossary_list(request_id: str) -> None:
    terms = get_glossary_service().list_terms()
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": [term.model_dump(mode="json") for term in terms],
    })


def handle_glossary_add(request_id: str, payload: dict[str, Any]) -> None:
    term = get_glossary_service().add_term(
        payload["source"],
        payload["target"],
        payload.get("note"),
        payload.get("category", "general"),
    )
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": term.model_dump(mode="json"),
    })


def handle_glossary_delete(request_id: str, payload: dict[str, Any]) -> None:
    deleted = get_glossary_service().delete_term(payload["term_id"])
    if not deleted:
        raise ValueError("Term not found")
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {"status": "ok"},
    })


def handle_update_yt_dlp(request_id: str) -> None:
    previous_version = get_yt_dlp_version()
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unknown pip error").strip()
        raise RuntimeError(detail)

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "status": "success",
            "message": "yt-dlp update completed. Restart the backend if the new version is not picked up immediately.",
            "previous_version": previous_version,
            "current_version": get_yt_dlp_version(),
        },
    })


def handle_analyze_url(request_id: str, payload: dict[str, Any]) -> None:
    from backend.services.analyzer import AnalyzerService
    analyzer = AnalyzerService()
    result = asyncio.run(analyzer.analyze(payload["url"]))
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result.model_dump(mode="json"),
    })


def handle_save_cookies(request_id: str, payload: dict[str, Any]) -> None:
    from backend.services.cookie_manager import CookieManager
    cookie_path = CookieManager().save_cookies(payload["domain"], payload["cookies"])
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "domain": payload["domain"],
            "has_valid_cookies": True,
            "cookie_path": str(cookie_path),
        },
    })


def handle_download(request_id: str, payload: dict[str, Any]) -> None:
    from backend.application.desktop_download_flow_service import DesktopDownloadFlowRequest, DesktopDownloadFlowService
    request = DesktopDownloadFlowRequest.model_validate(
        {
            **payload,
            "task_id": f"desktop-{request_id}",
        }
    )
    service = DesktopDownloadFlowService()

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "download_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    result = asyncio.run(service.execute(request, progress_callback=progress_callback))

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result.model_dump(mode="json"),
    })


def handle_extract(request_id: str, payload: dict[str, Any]) -> None:
    video_path = payload.get("video_path") or (payload.get("video_ref") or {}).get("path")
    if not video_path:
        raise ValueError("video_path or video_ref is required")
    engine_name = str(payload.get("engine") or "rapid")
    sample_rate = int(payload.get("sample_rate") or 2)
    roi_raw = payload.get("roi")
    roi = tuple(roi_raw) if isinstance(roi_raw, list) and len(roi_raw) == 4 else None

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    engine = get_ocr_engine(engine_name)
    if engine_name != "paddle" and getattr(engine, "ocr", None) is None:
        def init_progress(progress: float, message: str) -> None:
            emit({
                "type": "event",
                "event": "extract_progress",
                "id": request_id,
                "payload": {
                    "progress": round(progress * 20, 1),
                    "message": message,
                },
            })

        engine.initialize_models(init_progress)

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "extract_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    from backend.services.ocr.pipeline import VideoOCRPipeline
    pipeline = VideoOCRPipeline(engine)
    events = pipeline.process_video(
        video_path=video_path,
        roi=roi,
        sample_rate=sample_rate,
        progress_callback=progress_callback,
    )

    base_path, _ = os.path.splitext(video_path)
    json_path = f"{base_path}.ocr.json"
    srt_path = f"{base_path}.ocr.srt"

    with open(json_path, "w", encoding="utf-8") as file:
        json.dump([event.model_dump() for event in events], file, ensure_ascii=False, indent=2)

    def format_time(seconds: float) -> str:
        millis = int((seconds - int(seconds)) * 1000)
        seconds_int = int(seconds)
        mins, secs = divmod(seconds_int, 60)
        hrs, mins = divmod(mins, 60)
        return f"{hrs:02}:{mins:02}:{secs:02},{millis:03}"

    with open(srt_path, "w", encoding="utf-8") as file:
        for index, event in enumerate(events, 1):
            file.write(
                f"{index}\n"
                f"{format_time(event.start)} --> {format_time(event.end)}\n"
                f"{event.text.replace(chr(10), ' ')}\n\n"
            )

    emit({
        "type": "event",
        "event": "extract_progress",
        "id": request_id,
        "payload": {
            "progress": 100,
            "message": "Extraction Complete",
        },
    })
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "events": [event.model_dump(mode="json") for event in events],
            "files": [
                {"type": "json", "path": json_path},
                {"type": "srt", "path": srt_path},
            ],
        },
    })


def handle_get_ocr_results(request_id: str, payload: dict[str, Any]) -> None:
    video_path = payload["video_path"]
    base_path, _ = os.path.splitext(video_path)
    json_path = f"{base_path}.ocr.json"

    if not os.path.exists(json_path):
        events: list[dict[str, Any]] = []
    else:
        with open(json_path, "r", encoding="utf-8") as file:
            events = json.load(file)

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "events": events,
        },
    })


def handle_enhance(request_id: str, payload: dict[str, Any]) -> None:
    video_path = payload.get("video_path") or (payload.get("video_ref") or {}).get("path")
    if not video_path:
        raise ValueError("video_path or video_ref is required")
    method = str(payload.get("method") or "realesrgan")
    model = payload.get("model")
    scale = str(payload.get("scale") or "4x")

    enhancer = container.get(Services.ENHANCER)
    if not enhancer.is_available(method):
        detail = (
            "Real-ESRGAN binary not found."
            if method == "realesrgan"
            else "BasicVSR++ dependencies (mmmagic, cuda) not found."
        )
        raise RuntimeError(detail)

    source = Path(video_path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    try:
        scale_value = int(scale.lower().replace("x", ""))
    except (AttributeError, ValueError):
        scale_value = 4

    output_path = str(source.parent / f"{source.stem}_{method}_{scale_value}x{source.suffix}")

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "enhance_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    final_path = enhancer.upscale(
        input_path=video_path,
        output_path=output_path,
        model=model,
        scale=scale_value,
        method=method,
        progress_callback=progress_callback,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "success": True,
            "files": [
                {"type": "video", "path": final_path, "label": "upscaled_video"},
            ],
            "meta": {
                "video_path": final_path,
                "original_path": video_path,
                "model": model,
                "scale": scale_value,
                "method": method,
            },
        },
    })


def handle_clean(request_id: str, payload: dict[str, Any]) -> None:
    video_path = payload.get("video_path") or (payload.get("video_ref") or {}).get("path")
    if not video_path:
        raise ValueError("video_path or video_ref is required")
    roi = payload.get("roi") or [0, 0, 0, 0]
    method = str(payload.get("method") or "telea")

    source = Path(video_path)
    if not source.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cleaner = container.get(Services.CLEANER)
    output_path = str(source.with_name(f"{source.stem}_cleaned_{method}{source.suffix}"))

    def progress_callback(progress: int | float, message: str) -> None:
        emit({
            "type": "event",
            "event": "clean_progress",
            "id": request_id,
            "payload": {
                "progress": float(progress),
                "message": message,
            },
        })

    final_path = cleaner.clean_video(
        input_path=video_path,
        output_path=output_path,
        roi=roi,
        method=method,
        progress_callback=progress_callback,
    )

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "success": True,
            "files": [
                {"type": "video", "path": final_path, "label": "cleaned"},
            ],
            "meta": {
                "video_path": final_path,
                "method": method,
            },
        },
    })


def handle_detect_silence(request_id: str, payload: dict[str, Any]) -> None:
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


def handle_get_peaks(request_id: str, payload: dict[str, Any]) -> None:
    from backend.utils.peaks_generator import generate_peaks
    video_path = payload["video_path"]
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    generated_path = generate_peaks(video_path, output_path=None)
    if not generated_path or not os.path.exists(generated_path):
        raise RuntimeError("Failed to generate peaks")

    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "peaks_path": generated_path,
        },
    })


def handle_transcribe_segment(request_id: str, payload: dict[str, Any]) -> None:
    audio_path = payload.get("audio_path") or (payload.get("audio_ref") or {}).get("path")
    if not audio_path:
        raise ValueError("audio_path or audio_ref is required")
    start = float(payload["start"])
    end = float(payload["end"])
    duration = end - start
    if duration <= 0:
        raise ValueError("Invalid duration")

    from backend.services.asr import ASRService
    service = ASRService()
    result = service.transcribe_segment(
        audio_path=audio_path,
        start=start,
        end=end,
        model_name=payload.get("model", "base"),
        device=payload.get("device", "cpu"),
        language=payload.get("language"),
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


def handle_translate_segment(request_id: str, payload: dict[str, Any]) -> None:
    from backend.services.translator.llm_translator import LLMTranslator
    translator = LLMTranslator()
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


def handle_upload_watermark(request_id: str, payload: dict[str, Any]) -> None:
    input_path = payload["file_path"]
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    watermarks_dir = settings.USER_DATA_DIR / "watermarks"
    watermarks_dir.mkdir(parents=True, exist_ok=True)

    temp_input_path = settings.WORKSPACE_DIR / f"{Path(input_path).stem}_{request_id}{Path(input_path).suffix}"
    shutil.copyfile(input_path, temp_input_path)

    try:
        png_path = container.get(Services.VIDEO_SYNTHESIZER).process_watermark(str(temp_input_path))
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


def handle_get_latest_watermark(request_id: str) -> None:
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


def handle_request(request: dict[str, Any]) -> None:
    request_id = request.get("id")
    command = request.get("command")
    payload = request.get("payload") or {}

    if command == "ping":
        emit({
            "type": "response",
            "id": request_id,
            "ok": True,
            "result": {
                "status": "pong",
                "protocol_version": DESKTOP_WORKER_PROTOCOL_VERSION,
                "app_version": settings.APP_VERSION,
            },
        })
        return

    if command == "transcribe":
        handle_transcribe(str(request_id), payload)
        return

    if command == "translate":
        handle_translate(str(request_id), payload)
        return

    if command == "synthesize":
        handle_synthesize(str(request_id), payload)
        return

    if command == "get_settings":
        handle_get_settings(str(request_id))
        return

    if command == "update_settings":
        handle_update_settings(str(request_id), payload)
        return

    if command == "set_active_provider":
        handle_set_active_provider(str(request_id), payload)
        return

    if command == "test_provider":
        handle_test_provider(str(request_id), payload)
        return

    if command == "glossary_list":
        handle_glossary_list(str(request_id))
        return

    if command == "glossary_add":
        handle_glossary_add(str(request_id), payload)
        return

    if command == "glossary_delete":
        handle_glossary_delete(str(request_id), payload)
        return

    if command == "update_yt_dlp":
        handle_update_yt_dlp(str(request_id))
        return

    if command == "analyze_url":
        handle_analyze_url(str(request_id), payload)
        return

    if command == "save_cookies":
        handle_save_cookies(str(request_id), payload)
        return

    if command == "download":
        handle_download(str(request_id), payload)
        return

    if command == "extract":
        handle_extract(str(request_id), payload)
        return

    if command == "get_ocr_results":
        handle_get_ocr_results(str(request_id), payload)
        return

    if command == "enhance":
        handle_enhance(str(request_id), payload)
        return

    if command == "clean":
        handle_clean(str(request_id), payload)
        return

    if command == "detect_silence":
        handle_detect_silence(str(request_id), payload)
        return

    if command == "get_peaks":
        handle_get_peaks(str(request_id), payload)
        return

    if command == "transcribe_segment":
        handle_transcribe_segment(str(request_id), payload)
        return

    if command == "translate_segment":
        handle_translate_segment(str(request_id), payload)
        return

    if command == "upload_watermark":
        handle_upload_watermark(str(request_id), payload)
        return

    if command == "get_latest_watermark":
        handle_get_latest_watermark(str(request_id))
        return

    raise ValueError(f"Unknown worker command: {command}")


def main() -> None:
    configure_worker_stdio()
    configure_worker_logging()
    bootstrap_worker()
    emit({"type": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            handle_request(request)
        except Exception as exc:  # noqa: BLE001
            request_id = None
            try:
                request_id = json.loads(line).get("id")
            except Exception:  # noqa: BLE001
                request_id = None

            if isinstance(exc, ValidationError):
                emit_error(
                    str(request_id) if request_id is not None else None,
                    exc.json(),
                )
            else:
                emit_error(str(request_id) if request_id is not None else None, str(exc))
            traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    main()

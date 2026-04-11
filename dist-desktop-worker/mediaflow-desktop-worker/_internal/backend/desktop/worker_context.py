import json
import sys
from importlib import import_module
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from backend.config import settings
from backend.core.runtime_access import RuntimeServices

WORKER_PREFIX = "__MEDIAFLOW_WORKER__"
_RAPID_OCR_ENGINE = None
_PADDLE_OCR_ENGINE = None


def json_default(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(
        f"\n{WORKER_PREFIX}{json.dumps(payload, ensure_ascii=False, default=json_default)}\n"
    )
    sys.stdout.flush()


def emit_error(request_id: str | None, error: str) -> None:
    emit({
        "type": "response",
        "id": request_id,
        "ok": False,
        "error": error,
    })


def settings_service():
    return RuntimeServices.settings_manager()


def glossary_service():
    return RuntimeServices.glossary()


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

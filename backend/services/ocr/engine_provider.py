from typing import Literal

from backend.services.ocr.ocr_engine import PaddleOCREngine, RapidOCREngine

_rapid_ocr_engine = None
_paddle_ocr_engine = None


def get_ocr_engine(engine_type: Literal["rapid", "paddle"] | str = "rapid"):
    global _rapid_ocr_engine, _paddle_ocr_engine

    if engine_type == "paddle":
        if _paddle_ocr_engine is None:
            _paddle_ocr_engine = PaddleOCREngine()
        return _paddle_ocr_engine

    if _rapid_ocr_engine is None:
        _rapid_ocr_engine = RapidOCREngine()
    return _rapid_ocr_engine

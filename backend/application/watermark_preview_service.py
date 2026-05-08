import base64
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import BinaryIO, TypedDict

from PIL import Image
from loguru import logger

from backend.config import settings
from backend.services.video.watermark_processor import WatermarkProcessor


class WatermarkPreview(TypedDict):
    png_path: str
    data_url: str
    width: int
    height: int


def _watermark_dir() -> Path:
    path = settings.USER_DATA_DIR / "watermarks"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _latest_watermark_path() -> Path:
    return _watermark_dir() / "latest.png"


def _read_preview(path: Path) -> WatermarkPreview:
    with Image.open(path) as image:
        width, height = image.size

    with path.open("rb") as preview_file:
        encoded = base64.b64encode(preview_file.read()).decode("utf-8")

    return {
        "png_path": str(path),
        "data_url": f"data:image/png;base64,{encoded}",
        "width": width,
        "height": height,
    }


def save_watermark_preview(filename: str | None, stream: BinaryIO) -> WatermarkPreview:
    logger.info(f"[Preview] Received Watermark Upload: {filename}")
    safe_filename = Path(filename or "watermark").name
    temp_input_path = settings.WORKSPACE_DIR / f"{uuid.uuid4()}_{safe_filename}"
    persistent_path = _latest_watermark_path()

    with temp_input_path.open("wb") as buffer:
        shutil.copyfileobj(stream, buffer)

    try:
        png_path = Path(WatermarkProcessor.process_watermark(str(temp_input_path)))
        shutil.move(str(png_path), persistent_path)
        logger.info(f"[Preview] Moved persistent watermark to: {persistent_path}")
        return _read_preview(persistent_path)
    finally:
        time.sleep(0.2)
        try:
            if temp_input_path.exists():
                os.remove(temp_input_path)
                logger.debug(f"[Preview] Deleted temp input: {temp_input_path.name}")
        except Exception as exc:
            logger.warning(f"[Preview] Failed to delete temp input: {exc}")


def get_latest_watermark_preview() -> WatermarkPreview | None:
    persistent_path = _latest_watermark_path()
    if not persistent_path.exists():
        return None

    try:
        return _read_preview(persistent_path)
    except Exception:
        logger.exception(f"[Preview] Failed to read watermark preview: {persistent_path}")
        return None

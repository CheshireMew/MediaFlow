import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from loguru import logger

from backend.config import settings


@dataclass
class SuperResolutionResult:
    video_path: str
    options: dict
    progress_callback: object
    temp_path: str | None = None


class SuperResolutionStage:
    def __init__(self, enhancer_service=None):
        self._enhancer_service = enhancer_service

    def prepare(self, video_path: str, options: dict, progress_callback=None) -> SuperResolutionResult:
        next_options = dict(options or {})
        target_res = next_options.get("target_resolution", "original")
        if not isinstance(target_res, str) or not target_res.startswith("sr_"):
            return SuperResolutionResult(video_path, next_options, progress_callback)

        method, sr_scale = self._parse_target_resolution(target_res)
        enhancer = self._enhancer_service
        if enhancer is None:
            logger.warning("Enhancer service is unavailable, falling back to original resolution")
            next_options["target_resolution"] = "original"
            return SuperResolutionResult(video_path, next_options, progress_callback)
        if not enhancer.is_available(method):
            logger.warning(f"{method} enhancer not available, falling back to original resolution")
            next_options["target_resolution"] = "original"
            return SuperResolutionResult(video_path, next_options, progress_callback)

        source_suffix = Path(video_path).suffix
        suffix = source_suffix if source_suffix.isascii() and len(source_suffix) <= 16 else ".mp4"
        settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        temp_fd, temp_sr_path = tempfile.mkstemp(
            prefix=f"sr_{method}_{sr_scale}x_",
            suffix=suffix.lower(),
            dir=settings.TEMP_DIR,
        )
        os.close(temp_fd)
        os.remove(temp_sr_path)
        logger.info(f"Synthesis SR: upscaling {video_path} by {sr_scale}x using {method}")

        def sr_progress(percent, message_code, message_params=None):
            if progress_callback:
                progress_callback(
                    percent * 0.5,
                    message_code,
                    message_params or {},
                )

        enhancer.upscale(
            input_path=video_path,
            output_path=temp_sr_path,
            scale=sr_scale,
            method=method,
            progress_callback=sr_progress,
        )

        next_options["target_resolution"] = "original"
        next_callback = progress_callback
        if progress_callback:
            next_callback = lambda p, code, params=None: progress_callback(
                50 + p * 0.5,
                code,
                params or {},
            )
        return SuperResolutionResult(temp_sr_path, next_options, next_callback, temp_sr_path)

    @staticmethod
    def _parse_target_resolution(target_res: str) -> tuple[str, int]:
        parts = target_res.split("_")
        method = "realesrgan"
        sr_scale = 4

        if len(parts) == 2:
            try:
                sr_scale = int(parts[1].replace("x", ""))
            except (ValueError, TypeError):
                pass
        elif len(parts) >= 3:
            if parts[1] in {"realesrgan", "basicvsr"}:
                method = parts[1]
                try:
                    sr_scale = int(parts[2].replace("x", ""))
                except (ValueError, TypeError):
                    pass
            else:
                try:
                    sr_scale = int(parts[1].replace("x", ""))
                except (ValueError, TypeError):
                    pass
        return method, sr_scale

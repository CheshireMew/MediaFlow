import os
import tempfile
from dataclasses import dataclass

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

        if not settings.ENABLE_EXPERIMENTAL_PREPROCESSING:
            logger.warning(
                "Experimental SR preprocessing is disabled in this build; falling back to original resolution"
            )
            next_options["target_resolution"] = "original"
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

        temp_sr_path = os.path.join(
            tempfile.gettempdir(),
            f"sr_{method}_{sr_scale}x_{os.path.basename(video_path)}",
        )
        logger.info(f"SR preprocessing: upscaling {video_path} by {sr_scale}x using {method}")

        def sr_progress(percent, message):
            if progress_callback:
                progress_callback(percent * 0.5, f"[SR] {message}")

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
            next_callback = lambda p, m: progress_callback(50 + p * 0.5, m)
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

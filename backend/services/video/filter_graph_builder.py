import os
import shutil
import uuid
from pathlib import Path

import ffmpeg
from loguru import logger

from backend.services.video.media_prober import MediaProber
from backend.utils.font_assets import stage_font_files
from backend.utils.subtitle_manager import SubtitleManager


class FilterGraphBuilder:
    def build(self, video_stream, video_path: str, srt_path: str, watermark_path: str | None, options: dict):
        if options.get("crop_w") is not None:
            video_stream = video_stream.filter(
                "crop",
                w=options.get("crop_w"),
                h=options.get("crop_h"),
                x=options.get("crop_x"),
                y=options.get("crop_y"),
            )

        target_res = options.get("target_resolution", "original")
        render_width, render_height, scale_factor = self._resolve_render_dimensions(video_path, options)
        if target_res in ["720p", "1080p"]:
            target_h = 720 if target_res == "720p" else 1080
            video_stream = video_stream.filter("scale", w=-2, h=target_h)
            self._log_render_size(render_width, render_height, scale_factor)
        elif options.get("force_hd"):
            video_stream = video_stream.filter("scale", w=-2, h=720)
            self._log_render_size(render_width, render_height, scale_factor)

        video_stream = self._apply_watermark(
            video_stream,
            watermark_path,
            options,
            render_width,
            scale_factor,
        )
        video_stream, temp_ass, temp_fonts_dir = self._apply_subtitles(
            video_stream,
            srt_path,
            options,
            render_width,
            render_height,
            scale_factor,
        )
        return video_stream, temp_ass, temp_fonts_dir

    @staticmethod
    def cleanup(temp_ass: str | None, temp_fonts_dir: str | None) -> None:
        if temp_ass and os.path.exists(temp_ass):
            try:
                os.remove(temp_ass)
                logger.debug(f"Deleted temp subtitle: {temp_ass}")
            except Exception as exc:
                logger.warning(f"Failed to delete temp subtitle: {exc}")
        if temp_fonts_dir and os.path.exists(temp_fonts_dir):
            try:
                shutil.rmtree(temp_fonts_dir)
                logger.debug(f"Deleted temp fonts dir: {temp_fonts_dir}")
            except Exception as exc:
                logger.warning(f"Failed to delete temp fonts dir: {exc}")

    @staticmethod
    def _resolve_render_dimensions(video_path: str, options: dict):
        try:
            probed_w, probed_h = MediaProber.probe_resolution(video_path)
        except Exception as exc:
            logger.warning(f"Failed to probe video resolution: {exc}")
            probed_w, probed_h = (
                int(options.get("video_width", 1920)),
                int(options.get("video_height", 1080)),
            )

        crop_w = options.get("crop_w")
        crop_h = options.get("crop_h")
        base_w = int(crop_w) if crop_w is not None else int(probed_w)
        base_h = int(crop_h) if crop_h is not None else int(probed_h)
        if base_w <= 0:
            base_w = int(options.get("video_width", 1920))
        if base_h <= 0:
            base_h = int(options.get("video_height", 1080))

        target_res = options.get("target_resolution", "original")
        force_hd = options.get("force_hd")
        if target_res in ["720p", "1080p"] or force_hd:
            target_h = 720 if (target_res == "720p" or force_hd) else 1080
            scale_factor = target_h / base_h if base_h > 0 else 1.0
            render_w = int(base_w * scale_factor) if base_h > 0 else int(1280 * (target_h / 720))
            if render_w % 2 != 0:
                render_w -= 1
            return render_w, target_h, scale_factor

        return base_w, base_h, 1.0

    @staticmethod
    def _log_render_size(render_width: int, render_height: int, scale_factor: float) -> None:
        logger.info(
            f"Resolved render size for synthesis: {render_width}x{render_height} "
            f"(scale={scale_factor:.2f})"
        )

    @staticmethod
    def _apply_watermark(video_stream, watermark_path, options, render_width, scale_factor):
        if not watermark_path or not os.path.exists(watermark_path):
            return video_stream

        wm_input = ffmpeg.input(watermark_path)
        user_scale = float(options.get("wm_scale", 1.0))
        final_scale = user_scale * scale_factor
        relative_width = options.get("wm_relative_width")
        if relative_width is not None:
            try:
                from PIL import Image

                with Image.open(watermark_path) as watermark_image:
                    watermark_width, _ = watermark_image.size
                if watermark_width > 0:
                    user_scale = (render_width * float(relative_width)) / watermark_width
                    final_scale = user_scale
            except Exception as exc:
                logger.warning(f"Failed to resolve relative watermark width: {exc}")

        opacity = float(options.get("wm_opacity", 1.0))
        logger.info(f"Watermark scale: {user_scale} -> {final_scale:.2f}")

        wm_processed = wm_input.filter("scale", w=f"iw*{final_scale}", h=f"ih*{final_scale}")
        if opacity < 1.0:
            wm_processed = wm_processed.filter("format", "rgba").filter("colorchannelmixer", aa=opacity)

        x_expr = options.get("wm_x")
        y_expr = options.get("wm_y")
        if x_expr is None and options.get("wm_pos_x") is not None:
            x_expr = f"main_w*{float(options.get('wm_pos_x'))}-w/2"
        if y_expr is None and options.get("wm_pos_y") is not None:
            y_expr = f"main_h*{float(options.get('wm_pos_y'))}-h/2"
        return video_stream.overlay(wm_processed, x=x_expr or "10", y=y_expr or "10")

    @staticmethod
    def _apply_subtitles(video_stream, srt_path, options, render_width, render_height, scale_factor):
        if options.get("skip_subtitles"):
            logger.info("Subtitles disabled by user, skipping subtitle burn-in")
            return video_stream, None, None

        options["video_width"] = render_width
        options["video_height"] = render_height
        if scale_factor != 1.0:
            options["_smart_scale_factor"] = scale_factor

        temp_ass = os.path.abspath(f"temp_sub_{uuid.uuid4().hex[:8]}.ass")
        trim_start = float(options.get("trim_start", 0))
        sub_offset = -trim_start if trim_start > 0 else 0.0
        SubtitleManager.convert_srt_to_ass(srt_path, temp_ass, options, time_offset=sub_offset)

        temp_fonts_dir_path = stage_font_files(
            str(options.get("font_name", "")).strip(),
            Path(os.path.abspath(f"temp_fonts_{uuid.uuid4().hex[:8]}")),
        )
        temp_fonts_dir = str(temp_fonts_dir_path) if temp_fonts_dir_path else None
        subtitle_filter_kwargs = {}
        if temp_fonts_dir:
            subtitle_filter_kwargs["fontsdir"] = os.path.basename(temp_fonts_dir)
        video_stream = video_stream.filter("subtitles", os.path.basename(temp_ass), **subtitle_filter_kwargs)
        return video_stream, temp_ass, temp_fonts_dir

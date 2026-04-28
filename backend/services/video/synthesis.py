import os

import ffmpeg
from loguru import logger

from backend.services.video.encoder_config import EncoderConfigResolver
from backend.services.video.ffmpeg_runner import FfmpegRunner
from backend.services.video.filter_graph_builder import FilterGraphBuilder
from backend.services.video.media_prober import MediaProber
from backend.services.video.super_resolution_stage import SuperResolutionStage


class SynthesisOrchestrator:
    def __init__(
        self,
        *,
        super_resolution_stage: SuperResolutionStage,
        filter_graph_builder: FilterGraphBuilder,
        encoder_config_resolver: EncoderConfigResolver,
        ffmpeg_runner: FfmpegRunner,
    ):
        self._super_resolution_stage = super_resolution_stage
        self._filter_graph_builder = filter_graph_builder
        self._encoder_config_resolver = encoder_config_resolver
        self._ffmpeg_runner = ffmpeg_runner

    def synthesize(
        self,
        video_path: str,
        srt_path: str,
        output_path: str,
        watermark_path: str | None = None,
        options: dict | None = None,
        progress_callback=None,
    ):
        options = dict(options or {})
        temp_ass = None
        temp_fonts_dir = None
        sr_result = self._super_resolution_stage.prepare(video_path, options, progress_callback)
        try:
            self._validate_paths(sr_result.video_path, srt_path)
            duration = self._calculate_duration(sr_result.video_path, sr_result.options)
            input_video, audio = self._create_input_streams(sr_result.video_path, sr_result.options)
            video_stream, temp_ass, temp_fonts_dir = self._filter_graph_builder.build(
                input_video,
                sr_result.video_path,
                srt_path,
                watermark_path,
                sr_result.options,
            )
            output_kwargs = self._encoder_config_resolver.resolve(sr_result.options)
            self._ffmpeg_runner.run(
                video_stream,
                audio,
                output_path,
                output_kwargs,
                duration,
                sr_result.progress_callback,
            )
            return output_path
        except Exception as exc:
            logger.error(f"Synthesis failed: {exc}")
            raise
        finally:
            self._filter_graph_builder.cleanup(temp_ass, temp_fonts_dir)
            if sr_result.temp_path and os.path.exists(sr_result.temp_path):
                try:
                    os.remove(sr_result.temp_path)
                    logger.debug(f"Deleted temp SR file: {sr_result.temp_path}")
                except Exception as exc:
                    logger.warning(f"Failed to delete temp SR file: {exc}")

    @staticmethod
    def _validate_paths(video_path: str, srt_path: str) -> None:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")
        if not os.path.exists(srt_path):
            raise FileNotFoundError(f"Subtitles not found: {srt_path}")

    @staticmethod
    def _calculate_duration(video_path: str, options: dict) -> float:
        trim_start = float(options.get("trim_start", 0))
        trim_end = float(options.get("trim_end", 0))
        duration = MediaProber.get_duration(video_path)
        if trim_end > 0 and trim_start >= 0:
            return trim_end - trim_start
        if trim_start > 0 and duration > 0:
            return duration - trim_start
        return duration

    @staticmethod
    def _create_input_streams(video_path: str, options: dict):
        input_kwargs = {}
        trim_start = float(options.get("trim_start", 0))
        trim_end = float(options.get("trim_end", 0))
        if trim_start > 0:
            input_kwargs["ss"] = trim_start
        if trim_end > 0:
            input_kwargs["to"] = trim_end
        input_video = ffmpeg.input(video_path, **input_kwargs)
        audio_stream = input_video.audio if MediaProber.has_audio(video_path) else None
        return input_video.video, audio_stream

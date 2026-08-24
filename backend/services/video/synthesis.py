import os

import ffmpeg
from loguru import logger

from backend.services.video.encoder_config import EncoderConfigResolver
from backend.services.video.ffmpeg_runner import FfmpegRunner
from backend.services.video.filter_graph_builder import FilterGraphBuilder
from backend.services.video.media_prober import MediaProber
from backend.models.synthesis_contracts import SynthesisOptions, SynthesisRuntimeOptions


class SynthesisOrchestrator:
    def __init__(
        self,
        *,
        filter_graph_builder: FilterGraphBuilder,
        encoder_config_resolver: EncoderConfigResolver,
        ffmpeg_runner: FfmpegRunner,
    ):
        self._filter_graph_builder = filter_graph_builder
        self._encoder_config_resolver = encoder_config_resolver
        self._ffmpeg_runner = ffmpeg_runner

    def synthesize(
        self,
        video_path: str,
        srt_path: str | None,
        output_path: str,
        watermark_path: str | None = None,
        options: SynthesisOptions | SynthesisRuntimeOptions | dict | None = None,
        progress_callback=None,
    ):
        runtime_options = SynthesisRuntimeOptions.from_options(options)
        temp_ass = None
        temp_fonts_dir = None
        try:
            self._ensure_media_inputs_exist(video_path, srt_path, runtime_options)
            runtime_options = self._resolve_timeline_options(video_path, runtime_options)
            duration = self._calculate_duration(video_path, runtime_options)
            input_video, audio = self._create_input_streams(video_path, runtime_options)
            adapter_options = runtime_options.to_adapter_dict()
            video_stream, temp_ass, temp_fonts_dir = self._filter_graph_builder.build(
                input_video,
                video_path,
                srt_path,
                watermark_path,
                adapter_options,
            )
            output_kwargs = self._encoder_config_resolver.resolve(adapter_options)
            self._ffmpeg_runner.run(
                video_stream,
                audio,
                output_path,
                output_kwargs,
                duration,
                progress_callback,
            )
            return output_path
        except Exception as exc:
            logger.error(f"Synthesis failed: {exc}")
            raise
        finally:
            self._filter_graph_builder.cleanup(temp_ass, temp_fonts_dir)

    @staticmethod
    def _ensure_media_inputs_exist(
        video_path: str,
        srt_path: str | None,
        options: SynthesisRuntimeOptions,
    ) -> None:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")
        if not options.skip_subtitles and (not srt_path or not os.path.exists(srt_path)):
            raise FileNotFoundError(f"Subtitles not found: {srt_path}")

    @staticmethod
    def _resolve_timeline_options(
        video_path: str,
        options: SynthesisRuntimeOptions,
    ) -> SynthesisRuntimeOptions:
        if options.disable_auto_trim:
            return options

        manual_trim_start = options.trim_start
        if manual_trim_start <= 0:
            leading_black_end = MediaProber.detect_leading_black_end(video_path)
            if leading_black_end <= 0:
                return options
            logger.info(
                f"Auto-trimmed leading black frames at synthesis start: {leading_black_end:.6f}s"
            )
            return options.model_copy(update={"trim_start": leading_black_end})
        return options

    @staticmethod
    def _calculate_duration(video_path: str, options: SynthesisRuntimeOptions) -> float:
        trim_start = options.trim_start
        trim_end = options.trim_end
        duration = float(options.source_duration or 0)
        if duration <= 0:
            duration = MediaProber.get_duration(video_path)
        if trim_end > 0 and trim_start >= 0:
            return trim_end - trim_start
        if trim_start > 0 and duration > 0:
            return duration - trim_start
        return duration

    @staticmethod
    def _create_input_streams(video_path: str, options: SynthesisRuntimeOptions):
        input_kwargs = {}
        trim_start = options.trim_start
        trim_end = options.trim_end
        if trim_start > 0:
            input_kwargs["ss"] = trim_start
        if trim_end > 0:
            input_kwargs["to"] = trim_end
        input_video = ffmpeg.input(video_path, **input_kwargs)
        has_audio = options.source_has_audio
        if not isinstance(has_audio, bool):
            has_audio = MediaProber.has_audio(video_path)
        audio_stream = input_video.audio if has_audio else None
        return input_video.video, audio_stream

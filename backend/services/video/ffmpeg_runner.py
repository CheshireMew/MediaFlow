import subprocess
import time

import ffmpeg
from loguru import logger

from backend.config import settings


class FfmpegRunner:
    def run(self, video_stream, audio_stream, output_path, output_kwargs, duration, progress_callback):
        output_streams = [video_stream]
        if audio_stream is not None:
            output_streams.append(audio_stream)
        else:
            logger.info("No audio stream detected; exporting synthesized video without audio")

        out = ffmpeg.output(*output_streams, output_path, **output_kwargs)
        out = out.global_args("-hide_banner", "-progress", "pipe:1").overwrite_output()
        cmd_args = out.compile(cmd=settings.FFMPEG_PATH)
        logger.info(f"FFmpeg CMD: {' '.join(cmd_args)}")

        process = None
        try:
            process = subprocess.Popen(
                cmd_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                encoding="utf-8",
                errors="replace",
            )
            error_log = self._read_progress(process, duration, progress_callback)
            process.wait()
            if process.returncode != 0:
                raise RuntimeError(
                    f"FFmpeg failed with code {process.returncode}:\n" + "\n".join(error_log)
                )
        except Exception as exc:
            logger.error(f"FFmpeg execution failed: {exc}")
            if process and process.poll() is None:
                process.kill()
            raise

    @staticmethod
    def _read_progress(process, duration, progress_callback):
        last_report = 0.0
        current_pct = 0
        current_speed = ""
        error_log = []

        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            if line.startswith("out_time_us=") and duration > 0:
                try:
                    us = int(line.split("=", 1)[1])
                    current_pct = min(int((us / 1_000_000 / duration) * 100), 99)
                except (ValueError, TypeError):
                    pass
            elif line.startswith("speed="):
                raw = line.split("=", 1)[1].strip()
                if raw and raw != "N/A":
                    current_speed = f" ({raw})"
            elif line == "progress=continue":
                now = time.monotonic()
                if progress_callback and (now - last_report >= 3.0) and current_pct > 0:
                    progress_callback(current_pct, f"Encoding{current_speed}... {current_pct}%")
                    last_report = now
            elif line == "progress=end":
                break
            elif not line.startswith((
                "frame=",
                "fps=",
                "stream_0",
                "bitrate=",
                "total_size=",
                "out_time=",
                "dup_frames=",
                "drop_frames=",
            )):
                error_log.append(line)
                if len(error_log) > 20:
                    error_log.pop(0)
        return error_log

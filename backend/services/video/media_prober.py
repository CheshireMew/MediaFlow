import os
import re
import subprocess
import ffmpeg
from loguru import logger
from backend.config import settings

class MediaProber:
    _nvenc_available: bool | None = None  # Cached detection result
    _leading_black_pattern = re.compile(
        r"black_start:(?P<start>\d+(?:\.\d+)?)\s+"
        r"black_end:(?P<end>\d+(?:\.\d+)?)\s+"
        r"black_duration:(?P<duration>\d+(?:\.\d+)?)"
    )

    @staticmethod
    def _ffmpeg_probe_output(video_path: str) -> str:
        """Inspect media headers with ffmpeg when ffprobe is unavailable."""
        result = subprocess.run(
            [settings.FFMPEG_PATH, "-hide_banner", "-i", video_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
        return "\n".join(part for part in (result.stdout, result.stderr) if part)

    @staticmethod
    def detect_nvenc() -> bool:
        """Detect if h264_nvenc encoder is available in ffmpeg."""
        if MediaProber._nvenc_available is not None:
            return MediaProber._nvenc_available
        try:
            result = subprocess.run(
                [settings.FFMPEG_PATH, "-hide_banner", "-encoders"],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10
            )
            MediaProber._nvenc_available = "h264_nvenc" in result.stdout
            logger.info(f"NVENC detection: {'available' if MediaProber._nvenc_available else 'not available'}")
        except Exception as e:
            logger.warning(f"NVENC detection failed: {e}")
            MediaProber._nvenc_available = False
        return MediaProber._nvenc_available

    @staticmethod
    def get_duration(video_path: str) -> float:
        """Get video duration in seconds using ffprobe."""
        try:
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            return float(probe['format']['duration'])
        except Exception as e:
            logger.debug(f"Duration probe failed, trying ffmpeg fallback: {e}")
            try:
                output = MediaProber._ffmpeg_probe_output(video_path)
                match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
                if match:
                    hours, minutes, seconds = match.groups()
                    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
            except Exception as fallback_error:
                logger.warning(f"Duration fallback probe failed: {fallback_error}")
            return 0.0

    @staticmethod
    def parse_leading_black_end(ffmpeg_output: str, max_auto_trim: float = 0.15) -> float:
        """Return the end time of a short black run that starts at the media origin."""
        for match in MediaProber._leading_black_pattern.finditer(ffmpeg_output):
            start = float(match.group("start"))
            end = float(match.group("end"))
            if start <= 0.01 and 0 < end <= max_auto_trim:
                return end
        return 0.0

    @staticmethod
    def detect_leading_black_end(video_path: str, max_auto_trim: float = 0.15) -> float:
        """Detect short encoder-origin black frames at the start of a video."""
        try:
            result = subprocess.run(
                [
                    settings.FFMPEG_PATH,
                    "-hide_banner",
                    "-v",
                    "info",
                    "-t",
                    "2",
                    "-i",
                    video_path,
                    "-vf",
                    "blackdetect=d=0.01:pix_th=0.10",
                    "-an",
                    "-f",
                    "null",
                    "-",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
            )
            output = "\n".join(part for part in (result.stdout, result.stderr) if part)
            return MediaProber.parse_leading_black_end(output, max_auto_trim=max_auto_trim)
        except Exception as exc:
            logger.debug(f"Leading black probe failed: {exc}")
            return 0.0

    @staticmethod
    def has_audio(video_path: str) -> bool:
        """Return whether the media file contains at least one audio stream."""
        try:
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            return any(stream.get('codec_type') == 'audio' for stream in probe.get('streams', []))
        except Exception as e:
            logger.debug(f"Audio probe failed, trying ffmpeg fallback: {e}")
            try:
                output = MediaProber._ffmpeg_probe_output(video_path)
                return bool(re.search(r"Stream #\S+:\s*Audio:", output))
            except Exception as fallback_error:
                logger.warning(f"Audio fallback probe failed: {fallback_error}")
            return False

    @staticmethod
    def probe_resolution(video_path: str):
        try:
            # Use show_streams AND show_format to be safe, though streams is usually enough
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            w = int(video_info['width'])
            h = int(video_info['height'])
            
            # Detect Rotation
            rotate = 0
            
            # 1. Check Tags usually "rotate": "90"
            tags = video_info.get('tags', {})
            if 'rotate' in tags:
                rotate = int(tags['rotate'])
            
            # 2. Check Side Data (Display Matrix) if tag missing
            # Common in some MP4 containers
            if rotate == 0 and 'side_data_list' in video_info:
                logger.debug(f"Checking side_data_list: {video_info['side_data_list']}")
                for side_data in video_info['side_data_list']:
                    if side_data.get('side_data_type') == 'Display Matrix':
                        rotation = side_data.get('rotation', 0)
                        rotate = int(rotation)
                        break
            
            # Normalize rotation
            if abs(rotate) in [90, 270]:
                w, h = h, w
                logger.debug(f"Video is rotated {rotate} deg. Swapping resolution to {w}x{h}")
                
            return w, h
        except Exception as e:
            logger.debug(f"Probe resolution failed, trying ffmpeg fallback: {e}")
            try:
                output = MediaProber._ffmpeg_probe_output(video_path)
                match = re.search(r"Stream #\S+:\s*Video:.*?(\d{2,5})x(\d{2,5})", output)
                if match:
                    return int(match.group(1)), int(match.group(2))
            except Exception as fallback_error:
                logger.warning(f"Resolution fallback probe failed: {fallback_error}")
            return 1920, 1080

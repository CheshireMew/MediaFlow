import os
import subprocess
import ffmpeg
from loguru import logger
from backend.config import settings

class MediaProber:
    _nvenc_available: bool | None = None  # Cached detection result

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
        except Exception:
            return 0.0

    @staticmethod
    def has_audio(video_path: str) -> bool:
        """Return whether the media file contains at least one audio stream."""
        try:
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            return any(stream.get('codec_type') == 'audio' for stream in probe.get('streams', []))
        except Exception as e:
            logger.warning(f"Audio probe failed: {e}")
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
            logger.warning(f"Probe resolution failed: {e}")
            return 1920, 1080

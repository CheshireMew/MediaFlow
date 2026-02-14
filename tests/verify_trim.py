
import os
import sys
import ffmpeg
from loguru import logger

# Add project root to path
sys.path.append(os.getcwd())

from src.services.video_synthesizer import VideoSynthesizer
from src.config import settings

print(f"DEBUG: settings.FFMPEG_PATH = {settings.FFMPEG_PATH}")


def create_dummy_srt(path):
    content = """1
00:00:01,000 --> 00:00:03,000
Start: 1s, End: 3s

2
00:00:05,000 --> 00:00:07,000
Start: 5s, End: 7s

3
00:00:08,000 --> 00:00:09,000
Start: 8s, End: 9s
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def verify_trim():
    video_path = "data/test_video.mp4"
    srt_path = "data/test_srt.srt"
    output_path = "output/trimmed_video.mp4"
    
    # ensure output dir
    os.makedirs("output", exist_ok=True)
    
    # Create dummy SRT
    create_dummy_srt(srt_path)
    
    if not os.path.exists(video_path):
        logger.error(f"Test video not found: {video_path}. Please generate it first.")
        return

    synth = VideoSynthesizer()
    
    # Trim 2s from start, keep until 8s (total duration should be 6s)
    # Original video is 10s.
    # Subtitle 1 (1-3s) -> should become -1s to 1s (partially cut? or kept?)
    # Subtitle 2 (5-7s) -> should become 3s to 5s.
    # Subtitle 3 (8-9s) -> should become 6s to 7s (at the very end).
    
    options = {
        "trim_start": 2.0,
        "trim_end": 8.0,
        "video_width": 1280,
        "video_height": 720,
        "font_size": 40,
        "font_color": "&H00FFFFFF",
    }
    
    try:
        synth.burn_in_subtitles(video_path, srt_path, output_path, options=options)
        
        # Verify Duration
        probe = ffmpeg.probe(output_path, cmd=settings.FFPROBE_PATH)
        video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        duration = float(video_info['duration'])
        
        logger.info(f"Output duration: {duration}s")
        
        if 5.9 <= duration <= 6.1:
            logger.success("Test PASSED: Duration is correct (approx 6s)")
        else:
            logger.error(f"Test FAILED: Expected 6s, got {duration}s")
            
    except Exception as e:
        logger.error(f"Test FAILED with exception: {e}")

if __name__ == "__main__":
    verify_trim()

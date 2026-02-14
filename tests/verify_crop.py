
import os
import sys
import ffmpeg
from loguru import logger

# Add project root to path
sys.path.append(os.getcwd())

from src.services.video_synthesizer import VideoSynthesizer
from src.config import settings

def create_dummy_srt(path):
    content = """1
00:00:01,000 --> 00:00:03,000
Cropped Video Test
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def verify_crop():
    video_path = "data/test_video.mp4"
    srt_path = "data/test_srt_crop.srt"
    output_path = "output/cropped_video.mp4"
    
    # ensure output dir
    os.makedirs("output", exist_ok=True)
    
    # Create dummy SRT
    create_dummy_srt(srt_path)
    
    if not os.path.exists(video_path):
        logger.error(f"Test video not found: {video_path}. Please generate it first.")
        return

    synth = VideoSynthesizer()
    
    # Crop to center 640x360
    # Original: 1280x720
    # x = (1280 - 640) / 2 = 320
    # y = (720 - 360) / 2 = 180
    
    options = {
        "crop_w": 640,
        "crop_h": 360,
        "crop_x": 320,
        "crop_y": 180,
        "font_size": 40,
        "font_color": "&H00FFFFFF",
    }
    
    try:
        synth.burn_in_subtitles(video_path, srt_path, output_path, options=options)
        
        # Verify Resolution
        probe = ffmpeg.probe(output_path, cmd=settings.FFPROBE_PATH)
        video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        width = int(video_info['width'])
        height = int(video_info['height'])
        
        logger.info(f"Output resolution: {width}x{height}")
        
        if width == 640 and height == 360:
            logger.success("Test PASSED: Resolution is correct (640x360)")
        else:
            logger.error(f"Test FAILED: Expected 640x360, got {width}x{height}")
            
    except Exception as e:
        logger.error(f"Test FAILED with exception: {e}")

if __name__ == "__main__":
    verify_crop()


import os
import sys
import ffmpeg
from loguru import logger
import shutil

# Add project root to path
sys.path.append(os.getcwd())

from src.services.video_synthesizer import VideoSynthesizer
from src.config import settings
from src.utils.subtitle_writer import SubtitleWriter

def create_dummy_srt(path):
    content = """1
00:00:01,000 --> 00:00:03,000
Cropped Adaptive Test
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def verify_crop_adaptive():
    video_path = "data/test_video.mp4"
    srt_path = "data/test_srt_crop_adaptive.srt"
    output_path = "output/cropped_video_adaptive.mp4"
    
    # ensure output dir
    os.makedirs("output", exist_ok=True)
    
    # Create dummy SRT
    create_dummy_srt(srt_path)
    
    if not os.path.exists(video_path):
        logger.error(f"Test video not found: {video_path}. Please generate it first.")
        return

    synth = VideoSynthesizer()
    
    # Target Crop: 640x360
    crop_w = 640
    crop_h = 360
    
    options = {
        "crop_w": crop_w,
        "crop_h": crop_h,
        "crop_x": 320,
        "crop_y": 180,
        "font_size": 40,
        "font_color": "&H00FFFFFF",
        "wm_x": "w*0.1", # should be relative to crop
        "wm_y": "h*0.1",
        "wm_scale": 0.2,
        "wm_opacity": 0.5
    }
    
    # We want to intercept the ASS file generation to check PlayRes.
    # VideoSynthesizer generates a temp ASS file.
    # We can inspect the logic by manually calling convert_srt_to_ass with the same options
    # that VideoSynthesizer WOULD use.
    
    # Mocking the options logic from VideoSynthesizer
    synth_options = options.copy()
    if all(k in synth_options for k in ['crop_w', 'crop_h']):
        synth_options['video_width'] = synth_options['crop_w']
        synth_options['video_height'] = synth_options['crop_h']
        
    test_ass_path = "output/test_crop_adaptive.ass"
    SubtitleWriter.convert_srt_to_ass(srt_path, test_ass_path, style_options=synth_options)
    
    with open(test_ass_path, 'r', encoding='utf-8-sig') as f:
        content = f.read()
        
    logger.info(f"Checking ASS content in {test_ass_path}...")
    
    play_res_x = None
    play_res_y = None
    
    for line in content.splitlines():
        if line.startswith("PlayResX:"):
            play_res_x = int(line.split(":")[1].strip())
        if line.startswith("PlayResY:"):
            play_res_y = int(line.split(":")[1].strip())
            
    if play_res_x == crop_w and play_res_y == crop_h:
        logger.success(f"ASS Verification PASSED: PlayResX={play_res_x}, PlayResY={play_res_y} matches crop size.")
    else:
        logger.error(f"ASS Verification FAILED: Expected {crop_w}x{crop_h}, got {play_res_x}x{play_res_y}")

    # Now run the actual synthesis to ensure no FFmpeg errors
    logger.info("Running FFmpeg synthesis...")
    try:
        synth.burn_in_subtitles(video_path, srt_path, output_path, options=options)
        logger.success("FFmpeg synthesis PASSED.")
    except Exception as e:
        logger.error(f"FFmpeg synthesis FAILED: {e}")

if __name__ == "__main__":
    verify_crop_adaptive()

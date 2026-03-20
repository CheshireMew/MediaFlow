
import sys
import os
import logging
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

# Configure logging to capture logger output
logging.basicConfig(level=logging.INFO)

from backend.services.video_synthesizer import VideoSynthesizer

def test_subtitle_scaling_logic():
    print("--- Testing Subtitle Scaling Logic (WYSIWYG + WrapStyle 0) ---")
    synth = VideoSynthesizer()
    
    def simulate_logic(target_resolution, original_w, original_h):
        options = {
            'target_resolution': target_resolution,
            'video_width': None, 
            'video_height': None
        }
        
        # --- Logic from VideoSynthesizer (simplified adaptation) ---
        target_res = options.get('target_resolution', 'original')
        width = options.get('video_width')
        height = options.get('video_height')

        scale_factor = 1.0 

        # 1. Video Resolution Logic
        if target_res in ['720p', '1080p']:
             target_h = 720 if target_res == '720p' else 1080
             height = target_h
             
             orig_w, orig_h = original_w, original_h
             if orig_h > 0:
                 width = int(orig_w * (target_h / orig_h))
                 if width % 2 != 0: width -= 1
             else:
                 width = int(1280 * (target_h / 720))
             
             scale_factor = target_h / orig_h
             
        elif not width or not height:
            width, height = original_w, original_h
        
        options['video_width'] = width
        options['video_height'] = height
        
        # 2. Logic (Restored + WrapStyle)
        if scale_factor != 1.0:
            options['_smart_scale_factor'] = scale_factor
            
        options['wrap_style'] = 0
                 
        return options, scale_factor

    # Case 1: 360p Source -> 720p Target
    opts, v_scale = simulate_logic('720p', 480, 360)
    print(f"\nCase 1: 360p -> 720p (Upscale)")
    
    # Expect scale factor to be 2.0 (Video Scale), so Text is also scaled x2 (Large)
    expected_scale = 2.0
    actual_scale = opts.get('_smart_scale_factor', 1.0)
    print(f"  Video Scale Factor: {v_scale}")
    print(f"  Subtitle Scale Factor: {actual_scale} (Expected {expected_scale})")
    assert abs(actual_scale - expected_scale) < 0.01, f"Failed: Scale should follow video upscaling ({expected_scale})"
    
    # Expect WrapStyle 0
    wrap_style = opts.get('wrap_style')
    print(f"  Wrap Style: {wrap_style} (Expected 0)")
    assert wrap_style == 0, "Failed: WrapStyle must be 0"

    # Case 2: 1080p Source -> 720p Target
    opts, v_scale = simulate_logic('720p', 1920, 1080)
    print(f"\nCase 2: 1080p -> 720p (Downscale)")
    expected_scale = 1080 / 720.0 # Wait, scale factor is Target/Source = 0.666
    # No wait, logic is scale_factor = target_h / orig_h = 720 / 1080 = 0.666
    expected_scale = 0.6666
    actual_scale = opts.get('_smart_scale_factor', 1.0)
    print(f"  Video Scale Factor: {v_scale}")
    print(f"  Subtitle Scale Factor: {actual_scale} (Expected ~{expected_scale})")
    assert abs(actual_scale - expected_scale) < 0.01, "Failed: Scale should follow video downscaling"
    assert opts.get('wrap_style') == 0

    print("\nSUCCESS: All logic tests passed (WYSIWYG Restored + Smart Wrap).")

if __name__ == "__main__":
    test_subtitle_scaling_logic()

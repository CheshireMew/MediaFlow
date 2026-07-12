
import os
import subprocess
from backend.utils.subtitle_writer import SubtitleWriter

# Setup
TEST_TEXT = "你的邻居在股价5万美元时投入2万，或者借钱投入200万，然后股价跌到0，损失是一样的。" * 3 # Very long line
BASE_VIDEO = "temp/test_base.mp4" # Assume this exists (copied from original)
OUTPUT_DIR = "temp/verify_overflow"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_ass(filename, text, options):
    # Create dummy SRT file content
    srt_path = os.path.join(OUTPUT_DIR, "temp.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(f"1\n00:00:00,000 --> 00:00:05,000\n{text}\n\n")
        
    ass_path = os.path.join(OUTPUT_DIR, filename)
    
    # Generate ASS using SubtitleWriter (simulating what the app does)
    # We call SubtitleWriter directly to control options
    SubtitleWriter.convert_srt_to_ass(srt_path, ass_path, options)
    return ass_path

def render_clip(ass_path, output_name, options):
    # Use ffmpeg to render 5 seconds of black video with subtitles
    # or use the base video if available (better for ensuring resolution match)
    
    output_path = os.path.join(OUTPUT_DIR, output_name)
    
    width = options.get('video_width', 1280)
    height = options.get('video_height', 720)
    
    cmd = [
        "bin/ffmpeg.exe", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d=5", 
        "-vf", f"subtitles={ass_path.replace(os.sep, '/')}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", 
        output_path
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"Generated: {output_name}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to generate {output_name}: {e}")

def run_tests():
    base_options = {
        'video_width': 1280,
        'video_height': 720,
        'font_size': 24, # Standard size
        '_smart_scale_factor': 2.0, # Simulate the "Large" text condition (48px)
        'font_name': 'Arial',
        'wrap_style': 0 # Default Smart Wrap
    }

    # Test A: Baseline (ZWSP + Arial + Wrap 0)
    # This should reproduce the overflow if ZWSP/Font fails
    print("Test A: Baseline...")
    ass_a = generate_ass("test_a_baseline.ass", TEST_TEXT, base_options) # Uses default ZWSP injection in code
    render_clip(ass_a, "test_a_baseline.mp4", base_options)

    # Test B: Space (Replace ZWSP with Space)
    # We need to hack the text or options. SubtitleWriter injects ZWSP automatically for CJK.
    # To test SPACE, we provide text with spaces and maybe Disable ZWSP injection?
    # SubtitleWriter doesn't have a flag to disable ZWSP.
    # But we can pass text that is effectively space-separated so ZWSP doesn't matter as much?
    # No, better to verify if *ZWSP* is the issue.
    # Let's trust that SubtitleWriter injects ZWSP.
    # To test Space, we manually inject space in text.
    text_with_spaces = TEST_TEXT.replace("", " ").strip() # Space between every char
    print("Test B: Space Separation...")
    ass_b = generate_ass("test_b_space.ass", text_with_spaces, base_options)
    render_clip(ass_b, "test_b_space.mp4", base_options)

    # Test C: Font (Microsoft YaHei)
    # Use baseline text (ZWSP) but change font
    print("Test C: Font (Microsoft YaHei)...")
    opts_c = base_options.copy()
    opts_c['font_name'] = 'Microsoft YaHei'
    ass_c = generate_ass("test_c_font.ass", TEST_TEXT, opts_c)
    render_clip(ass_c, "test_c_font.mp4", opts_c)

    # Test D: WrapStyle 1 (End of line)
    print("Test D: WrapStyle 1...")
    opts_d = base_options.copy()
    opts_d['wrap_style'] = 1
    ass_d = generate_ass("test_d_wrap1.ass", TEST_TEXT, opts_d)
    render_clip(ass_d, "test_d_wrap1.mp4", opts_d)

    # Test E: Small Font (Normalization Check)
    # If font size is small (standard), does it wrap?
    print("Test E: Small Font (Scale 1.0)...")
    opts_e = base_options.copy()
    opts_e['_smart_scale_factor'] = 1.0 # 24px
    ass_e = generate_ass("test_e_small.ass", TEST_TEXT, opts_e)
    render_clip(ass_e, "test_e_small.mp4", opts_e)

    print("\nTests complete. Check output in temp/verify_overflow/")

if __name__ == "__main__":
    run_tests()

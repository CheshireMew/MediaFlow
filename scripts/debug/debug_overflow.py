
import glob
import subprocess
import sys
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.utils.subtitle_writer import SubtitleWriter
from backend.services.video_synthesizer import VideoSynthesizer

def analyze():
    # Find the video file
    video_files = glob.glob(str(repo_root / "temp" / "*Peter Lynch*.mp4"))
    if not video_files:
        print("Video not found!")
        return

    video_path = video_files[0]
    print(f"Found video: {video_path}")

    # Find the SRT file
    srt_files = glob.glob(str(repo_root / "temp" / "*Peter Lynch*.srt"))
    if not srt_files:
        print("SRT not found!")
        return
    
    # Filter out _CN.srt, pick the base one or the one user meant
    # User said "Original video" but didn't specify which SRT. The list_dir showed .srt and _CN.srt.
    # Usually the localized one (_CN) is the one burned if it's a translation task, or the original if just captioning.
    # Let's check both or the largest one.
    srt_path = next((f for f in srt_files if "_CN" in f), srt_files[0])
    print(f"Using SRT: {srt_path}")

    # Probe resolution
    synth = VideoSynthesizer()
    width, height = synth._probe_resolution(video_path)
    print(f"Video Resolution: {width}x{height}")

    # Simulate SubtitleWriter logic
    # Default options in synth
    options = {
        'video_width': width,
        'video_height': height,
        'font_name': 'Arial',
        'font_size': 24, # Default from code
        # mimic what video_synthesizer passes
    }

    # Generate ASS content in memory (simulate)
    # We can't easily get the string without modifying the code or using a temp file.
    # Let's use the actual method to a temp file
    temp_ass = str(repo_root / "temp" / "debug_output.ass")
    
    print("Converting to ASS...")
    SubtitleWriter.convert_srt_to_ass(srt_path, temp_ass, options)
    
    if os.path.exists(temp_ass):
        with open(temp_ass, 'r', encoding='utf-8-sig') as f:
            content = f.read()
            print("\n--- ASS HEADER ---")
            print("\n".join(content.splitlines()[:20]))
            
            print("\n--- LONGEST LINES ---")
            events = [line for line in content.splitlines() if line.startswith("Dialogue:")]
            # Extract text
            # Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            # We want the text part. It's the last field (comma separated, but text can contain commas? No, ASS format handles it)
            # Actually, "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Text"
            # It has 9 commas before text.
            longest_evt = ""
            max_len = 0
            for evt in events:
                parts = evt.split(',', 9)
                if len(parts) > 9:
                    text = parts[9]
                    if len(text) > max_len:
                        max_len = len(text)
                        longest_evt = evt
            
            print(f"Longest line ({max_len} chars):")
            print(longest_evt)

if __name__ == "__main__":
    try:
        analyze()
    except Exception as e:
        print(f"Error: {e}")

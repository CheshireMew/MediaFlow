
import sys
import os
import ffmpeg
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

# Define paths
input_video = r"e:\Work\Code\Mediaflow\temp\Oguz Erkan - Peter Lynch explains how to deal with a falling stock.  It’s quite re... [2021709347286638592].mp4"
output_video = r"e:\Work\Code\Mediaflow\temp\Oguz Erkan - Peter Lynch explains how to deal with a falling stock.  It’s quite re... [2021709347286638592]_synthesized.mp4"

def probe_file(path):
    print(f"Probing: {path}")
    if not os.path.exists(path):
        print("File not found!")
        return

    try:
        probe = ffmpeg.probe(path, cmd=r"e:\Work\Code\Mediaflow\bin\ffprobe.exe")
        import json
        print(json.dumps(probe, indent=2))
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        if video_stream:
            width = int(video_stream['width'])
            height = int(video_stream['height'])
            tags = video_stream.get('tags', {})
            rotate = int(tags.get('rotate', 0))
            print(f"  Resolution: {width}x{height}")
            print(f"  Rotation: {rotate}")
            if rotate in [90, 270, -90, -270]:
                print(f"  Effective Resolution: {height}x{width}")
            else:
                print(f"  Effective Resolution: {width}x{height}")
        else:
            print("  No video stream found.")
    except Exception as e:
        print(f"  Error: {e}")

print("--- INPUT VIDEO ---")
probe_file(input_video)

print("\n--- OUTPUT VIDEO ---")
probe_file(output_video)

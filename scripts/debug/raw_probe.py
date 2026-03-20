
import subprocess
import json
import os
import sys
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

ffprobe_path = r"e:\Work\Code\Mediaflow\bin\ffprobe.exe"
input_video = r"e:\Work\Code\Mediaflow\temp\Oguz Erkan - Peter Lynch explains how to deal with a falling stock.  It’s quite re... [2021709347286638592].mp4"

cmd = [
    ffprobe_path,
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    input_video
]

print(f"Running: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')

try:
    data = json.loads(result.stdout)
    video_stream = next((s for s in data['streams'] if s['codec_type'] == 'video'), None)
    if video_stream:
        print(json.dumps(video_stream, indent=2))
        if 'side_data_list' in video_stream:
            print("\nFOUND SIDE DATA LIST!")
        else:
            print("\nNO SIDE DATA LIST FOUND.")
    else:
        print("No video stream.")
except Exception as e:
    print(f"Error parsing json: {e}")
    # print raw output if json fails
    print(result.stdout[:1000])

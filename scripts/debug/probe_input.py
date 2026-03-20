
import sys
import os
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.services.video_synthesizer import VideoSynthesizer

# Define paths
input_video = r"e:\Work\Code\Mediaflow\temp\Oguz Erkan - Peter Lynch explains how to deal with a falling stock.  It’s quite re... [2021709347286638592].mp4"

def test_probe():
    print(f"Testing _probe_resolution on: {input_video}")
    if not os.path.exists(input_video):
        print("File not found.")
        return

    vs = VideoSynthesizer()
    w, h = vs._probe_resolution(input_video)
    print(f"Detected Effective Resolution: {w}x{h}")
    
    if w < h:
        print("Result: PORTRAIT (Correct)")
    else:
        print("Result: LANDSCAPE (Incorrect for vertical video)")

if __name__ == "__main__":
    test_probe()

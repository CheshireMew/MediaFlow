
import cv2
import numpy as np
import os
import sys
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.services.cleaner import CleanerService

def create_test_video(filename, width=320, height=240, frames=10):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(filename, fourcc, 10, (width, height))
    
    for i in range(frames):
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Background: moving gradient or something
        img[:] = (i * 10 % 255, i * 5 % 255, 100)
        
        # "Watermark" at 50,50
        cv2.putText(img, "WATERMARK", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        out.write(img)
    
    out.release()
    print(f"Created test video: {filename}")

def progress(percent, status):
    print(f"[{percent:.1f}%] {status}")

def verify_cleaner():
    cleaner = CleanerService()

    output_dir = repo_root / "output" / "verify_cleaner"
    output_dir.mkdir(parents=True, exist_ok=True)
    test_video = str(output_dir / "test_cleaner_input.mp4")
    output_telea = str(output_dir / "test_cleaner_telea.mp4")
    output_prop = str(output_dir / "test_cleaner_propainter.mp4")
    
    create_test_video(test_video)
    
    roi = [40, 20, 200, 50] # x, y, w, h covering "WATERMARK" at 50,50
    
    print("\n--- Testing Telea ---")
    try:
        cleaner.clean_video(test_video, output_telea, roi, method="telea", progress_callback=progress)
        print("Telea passed.")
    except Exception as e:
        print(f"Telea failed: {e}")

    print("\n--- Testing ProPainter ---")
    try:
        cleaner.clean_video(test_video, output_prop, roi, method="propainter", progress_callback=progress)
        print("ProPainter passed.")
    except Exception as e:
        print(f"ProPainter failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_cleaner()

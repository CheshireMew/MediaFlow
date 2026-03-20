
import os
import sys
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.services.enhancer import RealESRGANService
from loguru import logger

def run():
    # 1. Create a dummy test video
    test_video = str(repo_root / "temp" / "test_input_realesrgan.mp4")
    # We can rely on existing one or create new
    if not os.path.exists(test_video):
        print("Creating dummy video...")
        import subprocess
        ffmpeg_path = str(repo_root / "bin" / "ffmpeg.exe")
        subprocess.run([ffmpeg_path, "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1", "-c:v", "libx264", test_video], check=True)

    output_video = str(repo_root / "output" / "test_output_realesrgan.mp4")
    if os.path.exists(output_video):
        os.remove(output_video)
        
    print("Running RealESRGANService...")
    service = RealESRGANService()
    
    def progress(p, msg):
        print(f"Progress: {p}% - {msg}")

    try:
        service.upscale(test_video, output_video, progress_callback=progress)
        print("Success!", output_video)
    except Exception as e:
        print("Error:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run()

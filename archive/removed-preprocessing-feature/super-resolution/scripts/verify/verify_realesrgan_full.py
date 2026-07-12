
import os
import logging
import time
from backend.services.realesrgan_service import RealESRGANService
from backend.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RealESRGANFullTest")

def create_dummy_video(path, duration=1):
    import subprocess
    # Create a 1-second video with counter
    cmd = [
        settings.FFMPEG_PATH, "-y",
        "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=640x360:rate=30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    logger.info(f"Created dummy video: {path}")

def test_full_upscale():
    print("----------------------------------------------------------------")
    print(" Verifying Real-ESRGAN Full Pipeline")
    print("----------------------------------------------------------------")

    service = RealESRGANService()
    
    # 1. Create Test Video
    test_video = "test_input.mp4"
    output_video = "test_output_upscaled.mp4"
    
    try:
        if os.path.exists(test_video): os.remove(test_video)
        if os.path.exists(output_video): os.remove(output_video)
        
        create_dummy_video(test_video)
        
        # 2. Run Upscale
        start_time = time.time()
        def callback(progress, code, params):
            print(f"[PROGRESS] {progress:.1f}% - {code} {params}")
            
        print("Starting upscale...")
        result_path = service.upscale(
            input_path=test_video, 
            output_path=output_video, 
            scale=2, # Use 2x for speed
            progress_callback=callback
        )
        
        duration = time.time() - start_time
        print(f"[SUCCESS] Upscale complete in {duration:.2f}s")
        print(f"Output: {result_path}")
        
        # 3. Verify Output
        if os.path.exists(result_path) and os.path.getsize(result_path) > 1000:
            print("[OK] Output file exists and has size.")
        else:
            print("[FAIL] Output file missing or empty.")

    except Exception as e:
        print(f"[FAIL] Exception during test: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Cleanup
        # if os.path.exists(test_video): os.remove(test_video)
        # if os.path.exists(output_video): os.remove(output_video)
        pass

if __name__ == "__main__":
    test_full_upscale()

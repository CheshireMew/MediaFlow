
import os
import logging
from backend.services.realesrgan_service import RealESRGANService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RealESRGANChecker")

def test_realesrgan():
    print("----------------------------------------------------------------")
    print(" Verifying Real-ESRGAN Integration")
    print("----------------------------------------------------------------")

    # 1. Initialize Service
    try:
        service = RealESRGANService()
        print(f"[OK] Service initialized.")
    except Exception as e:
        print(f"[FAIL] Service init failed: {e}")
        return

    # 2. Check Binary
    if service.is_available():
        print(f"[OK] Binary found at: {service.binary_path}")
    else:
        print(f"[FAIL] Binary NOT found!")
        return

    # 3. Check Models
    binary_dir = os.path.dirname(service.binary_path)
    models_dir = os.path.join(binary_dir, "models")
    if os.path.exists(models_dir):
        print(f"[OK] Models dir found at: {models_dir}")
        models = os.listdir(models_dir)
        print(f"     Models: {models}")
    else:
        print(f"[WARN] Models dir NOT found at {models_dir}. Upscaling might fail.")

    # 4. Run Dummy Upscale (Dry Run or Small Test)
    # We won't run full upscale here unless user wants, but we can try to run the binary with -h
    import subprocess
    try:
        result = subprocess.run([service.binary_path, "-h"], capture_output=True, text=True)
        if result.returncode == 0 or "usage" in result.stderr.lower(): # ncnn often prints help to stderr
             print(f"[OK] Binary is executable and prints help.")
        else:
             print(f"[FAIL] Binary execution failed. Return code: {result.returncode}")
             print(f"Stderr: {result.stderr}")
    except Exception as e:
        print(f"[FAIL] Binary execution exception: {e}")

if __name__ == "__main__":
    test_realesrgan()


import subprocess
import time
from pathlib import Path
from backend.services.realesrgan_service import RealESRGANService

def benchmark_realesrgan():
    service = RealESRGANService()
    binary = service.binary_path
    if not binary:
        print("Binary not found")
        return

    # Create a dummy image if not exists
    from PIL import Image
    dummy_img = "bench_input.jpg"
    if not Path(dummy_img).exists():
        img = Image.new('RGB', (1920, 1080), color='blue') # Full HD to stress it slightly
        img.save(dummy_img)
    
    output_img = "bench_output.jpg"
    
    # Run with verbose output
    # -g auto: default
    # -j 4:4:4 : try aggressive threading
    cmd = [
        binary,
        "-i", dummy_img,
        "-o", output_img,
        "-s", "4",
        "-n", "realesrgan-x4plus", # The heavy model
        "-v"
    ]
    
    print(f"Running command: {' '.join(cmd)}")
    start = time.time()
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    end = time.time()
    duration = end - start
    
    print(f"Duration: {duration:.2f} seconds")
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr) # NCNN logs usually go to stderr
    
    if Path(output_img).exists():
        Path(output_img).unlink()
    if Path(dummy_img).exists():
        Path(dummy_img).unlink()

if __name__ == "__main__":
    benchmark_realesrgan()

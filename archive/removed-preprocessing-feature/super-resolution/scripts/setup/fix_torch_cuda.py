import os
import subprocess
import sys

# Script to force install CUDA torch using SJTU mirror
ENV_DIR = os.path.join("bin", "python_env")
PYTHON_EXE = os.path.join(ENV_DIR, "python.exe")

# Direct Links from Aliyun Mirror (Verified)
TORCH_URL = "https://mirrors.aliyun.com/pytorch-wheels/cu118/torch-2.0.1%2Bcu118-cp310-cp310-win_amd64.whl"
TORCHVISION_URL = "https://mirrors.aliyun.com/pytorch-wheels/cu118/torchvision-0.15.2%2Bcu118-cp310-cp310-win_amd64.whl"

def download_file(url, filename):
    print(f"Downloading {filename} from Aliyun...")
    import requests
    response = requests.get(url, stream=True)
    response.raise_for_status()
    total_size = int(response.headers.get('content-length', 0))
    block_size = 1024 * 1024 # 1MB
    
    with open(filename, 'wb') as f:
        downloaded = 0
        for data in response.iter_content(block_size):
            f.write(data)
            downloaded += len(data)
            if total_size > 0:
                percent = (downloaded / total_size) * 100
                print(f"Progress: {percent:.1f}%", end='\r')
    print(f"\nDownloaded {filename}")

def run_fix():
    print("Upgrading Torch to CUDA 11.8 version using Aliyun Mirror (Direct Download)...")
    
    # 1. Uninstall existing torch
    print("Uninstalling CPU torch...")
    try:
        subprocess.check_call([PYTHON_EXE, "-m", "pip", "uninstall", "-y", "torch", "torchvision"])
    except:
        pass 

    # 2. Download Wheels
    torch_whl = os.path.join(ENV_DIR, "torch-2.0.1+cu118-cp310-cp310-win_amd64.whl")
    torchvision_whl = os.path.join(ENV_DIR, "torchvision-0.15.2+cu118-cp310-cp310-win_amd64.whl")
    
    if not os.path.exists(torch_whl):
        download_file(TORCH_URL, torch_whl)
        
    if not os.path.exists(torchvision_whl):
         download_file(TORCHVISION_URL, torchvision_whl)

    # 3. Install Wheels
    print("Installing CUDA torch wheels...")
    cmd = [
        PYTHON_EXE, "-m", "pip", "install",
        torch_whl,
        torchvision_whl,
        "--no-warn-script-location"
    ]
    
    try:
        subprocess.check_call(cmd)
        print("Torch CUDA installed successfully.")
        
        # Cleanup
        os.remove(torch_whl)
        os.remove(torchvision_whl)
        
    except subprocess.CalledProcessError as e:
        print(f"Error installing CUDA torch: {e}")
        sys.exit(1)

    # 3. Verify
    print("Verifying...")
    verify_cmd = [
        PYTHON_EXE, "-c", 
        "import torch; print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'Version: {torch.__version__}')"
    ]
    subprocess.check_call(verify_cmd)

if __name__ == "__main__":
    if not os.path.exists(PYTHON_EXE):
        print("Python environment not found.")
        sys.exit(1)
    run_fix()

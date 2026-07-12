import os
import subprocess
import sys

# Script to fix mmcv-full installation using MIM
ENV_DIR = os.path.join("bin", "python_env")
PYTHON_EXE = os.path.join(ENV_DIR, "python.exe")

# Direct URL for mmcv-full 1.7.2 (First version supporting Torch 2.0 on Windows)
# Verified structure: https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html
MMCV_WHL_URL = "https://download.openmmlab.com/mmcv/dist/cu118/torch2.0.0/mmcv_full-1.7.2-cp310-cp310-win_amd64.whl"

def install_mim_and_mmcv():
    print("Installing mmcv-full directly from official wheel...")
    
    cmd = [
        PYTHON_EXE, "-m", "pip", "install", 
        MMCV_WHL_URL,
        "--no-deps",
        "--upgrade",
        "--force-reinstall",
        "--no-warn-script-location"
    ]
    
    try:
        subprocess.check_call(cmd)
        print("mmcv-full installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Installation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if not os.path.exists(PYTHON_EXE):
        print("Python environment not found.")
        sys.exit(1)
    install_mim_and_mmcv()

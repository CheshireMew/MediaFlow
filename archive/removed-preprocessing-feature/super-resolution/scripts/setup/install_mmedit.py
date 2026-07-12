import os
import subprocess
import sys

# Script to install mmedit into the existing python_env
ENV_DIR = os.path.join("bin", "python_env")
PYTHON_EXE = os.path.join(ENV_DIR, "python.exe")

def install_mmedit():
    print("Installing mmedit==0.16.1 (contains BasicVSR++)...")
    # mmedit 0.16.1 is compatible with mmcv-full 1.x
    cmd = [
        PYTHON_EXE, "-m", "pip", "install", 
        "mmedit==0.16.1",
        "--no-deps", # Avoid triggering mmcv build again
        "--no-warn-script-location"
    ]
    
    try:
        subprocess.check_call(cmd)
        print("mmedit installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error installing mmedit: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if not os.path.exists(PYTHON_EXE):
        print("Python environment not found. Wait for install_basicvsr.py to finish.")
        sys.exit(1)
    install_mmedit()

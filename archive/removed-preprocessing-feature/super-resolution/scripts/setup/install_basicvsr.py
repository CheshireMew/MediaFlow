import os
import sys
import requests
import zipfile
import io
import subprocess

# Configuration
PYTHON_EMBED_URL = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
ENV_DIR = os.path.join("bin", "python_env")
PYTHON_EXE = os.path.join(ENV_DIR, "python.exe")

# Mirror for speed in CN
MIRROR_URL = "https://pypi.tuna.tsinghua.edu.cn/simple"

def download_file(url, desc):
    print(f"Downloading {desc}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        sys.exit(1)

def setup_python_env():
    if os.path.exists(ENV_DIR):
        print(f"Environment directory {ENV_DIR} already exists. Skipping download.")
        # Check if pip installed
        try:
             subprocess.check_call([PYTHON_EXE, "-m", "pip", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
             return
        except:
             pass
    else:
        os.makedirs(ENV_DIR, exist_ok=True)
        
        # 1. Download Python Embed
        content = download_file(PYTHON_EMBED_URL, "Python 3.10 Embeddable")
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            z.extractall(ENV_DIR)
        print("Extracted Python 3.10.")

        # 2. Fix python310._pth to enable site-packages (crucial for pip)
        pth_file = os.path.join(ENV_DIR, "python310._pth")
        with open(pth_file, "r") as f:
            lines = f.readlines()
        
        with open(pth_file, "w") as f:
            for line in lines:
                if line.strip() == "#import site":
                    f.write("import site\n")
                else:
                    f.write(line)
        print("Patched python310._pth to enable pip.")

    # 3. Install Pip
    # Check if pip is installed
    try:
        subprocess.check_call([PYTHON_EXE, "-m", "pip", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Pip is already installed.")
    except Exception:
        print("Installing Pip...")
        get_pip_content = download_file(GET_PIP_URL, "get-pip.py")
        get_pip_path = os.path.join(ENV_DIR, "get_pip.py")
        with open(get_pip_path, "wb") as f:
            f.write(get_pip_content)
        
        # Use mirror for pip install pip? No, get-pip handles it.
        subprocess.check_call([PYTHON_EXE, get_pip_path])
        print("Pip installed.")

def install_dependencies():
    print("Installing Dependencies using Tsinghua Mirror...")
    
    # 1. PyTorch 2.0.1 (Windows wheel usually includes CUDA)
    # Using Tsinghua mirror
    cmd_torch = [
        PYTHON_EXE, "-m", "pip", "install", 
        "torch==2.0.1", 
        "torchvision==0.15.2", 
        "-i", MIRROR_URL,
        "--no-warn-script-location"
    ]
    
    # 2. MMCV-Full 1.7.1
    # Needs to match torch 2.0.0 (or 2.x) and cuda 11.8
    # We specify the official URL for wheels because mirror might not have pre-builts mapped correctly
    cmd_mmcv = [
        PYTHON_EXE, "-m", "pip", "install", 
        "mmcv-full==1.7.1", 
        "-f", "https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html",
        "--no-warn-script-location"
    ]
    
    # 3. MMediting (BasicVSR++) and Utils
    cmd_deps = [
        PYTHON_EXE, "-m", "pip", "install",
        "mmedit==0.16.1",
        "numpy", "opencv-python", "scipy", "future", "tensorboard",
        "-i", MIRROR_URL,
        "--no-warn-script-location"
    ]

    try:
        print("1/3 Installing PyTorch (Fast Mirror)...")
        subprocess.check_call(cmd_torch)
        
        print("2/3 Installing MMCV-Full...")
        subprocess.check_call(cmd_mmcv)
        
        print("3/3 Installing MMediting & Utils...")
        subprocess.check_call(cmd_deps)
        
        print("All dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Error installing dependencies: {e}")
        sys.exit(1)

if __name__ == "__main__":
    setup_python_env()
    install_dependencies()

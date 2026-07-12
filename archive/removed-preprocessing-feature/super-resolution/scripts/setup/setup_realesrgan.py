
import shutil
import requests
import zipfile
import io
from pathlib import Path

# URL for Real-ESRGAN ncnn Vulkan (Windows)
# Using a specific version for stability
# URL for Real-ESRGAN ncnn Vulkan (Windows)
# Using a specific version for stability
# GHProxy mirror for China users
GITHUB_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"
MIRROR_URL = "https://mirror.ghproxy.com/" + GITHUB_URL

BINARY_NAME = "realesrgan-ncnn-vulkan.exe"


def setup_realesrgan(use_mirror=True):
    url = MIRROR_URL if use_mirror else GITHUB_URL
    print(f"Downloading Real-ESRGAN from {url}...")
    
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        
        print("Extracting...")
        z = zipfile.ZipFile(io.BytesIO(r.content))
        
        # Determine extraction target
        bin_dir = Path("bin")
        bin_dir.mkdir(exist_ok=True)
        
        # Scan zip for the exe
        exe_path_in_zip = None
        for file in z.namelist():
            if file.endswith(BINARY_NAME):
                exe_path_in_zip = file
                break
        
        if not exe_path_in_zip:
            print(f"Error: {BINARY_NAME} not found in zip.")
            return

        # Extract only the exe and models
        # Real-ESRGAN needs models folder next to exe usually, or passing -m path
        # The zip usually has a folder structure. Let's extract everything to bin/realesrgan
        
        target_dir = bin_dir / "realesrgan"
        target_dir.mkdir(exist_ok=True)
        
        z.extractall(target_dir)
        print(f"Extracted to {target_dir}")
        
        # flattened approach or keep folder? 
        # Service looks in bin/realesrgan-ncnn-vulkan.exe
        # The zip structure is usually "realesrgan-ncnn-vulkan-20220424-windows/realesrgan-ncnn-vulkan.exe"
        
        # Let's find where the exe ended up
        found_exe = list(target_dir.rglob(BINARY_NAME))
        if found_exe:
            # Move contents of that folder to bin/ if desired, or just copy exe to bin/
            # For simplicity, let's copy the exe to bin/ and models to bin/models if needed?
            # Actually, the exe expects models relative to it.
            # Best to keep them in their folder and maybe symlink or just point service there.
            
            # Service implementation checks:
            # Path("bin/realesrgan-ncnn-vulkan.exe")
            # Path("tools/realesrgan-ncnn-vulkan.exe")
            # ...
            
            # Let's move the executable and its "models" folder to bin/
            src_parent = found_exe[0].parent
            
            # Move exe
            shutil.copy2(found_exe[0], bin_dir / BINARY_NAME)
            
            # Move models dir if exists
            models_src = src_parent / "models"
            if models_src.exists():
                models_dest = bin_dir / "models"
                if models_dest.exists():
                    shutil.rmtree(models_dest)
                shutil.copytree(models_src, models_dest)
                print(f"Copied models to {models_dest}")
            
            print(f"Setup complete. Binary is at {bin_dir / BINARY_NAME}")

    except Exception as e:
        print(f"Failed to setup Real-ESRGAN: {e}")

if __name__ == "__main__":
    # Check if we should use mirror based on simple locale check or arg?
    # Defaulting to True for now as requested, or can add arg parser
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-mirror", action="store_true", help="Disable Chinese mirror")
    args = parser.parse_args()
    
    setup_realesrgan(use_mirror=not args.no_mirror)

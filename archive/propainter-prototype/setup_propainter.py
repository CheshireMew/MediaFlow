
import os
import sys
import requests
import shutil
import stat
from pathlib import Path

import time
import subprocess

# URLs
REPO_URL = "https://github.com/sczhou/ProPainter.git"
# REPO_TAG = "v0.1.0" # Tag seems empty/broken?

WEIGHTS_BASE_URL = "https://github.com/sczhou/ProPainter/releases/download/v0.1.0"
WEIGHTS = [
    "ProPainter.pth",
    "raft-things.pth",
    "recurrent_flow_completion.pth"
]

# Mirrors for weights
MIRRORS = [
    "https://mirror.ghproxy.com/",
    "https://ghproxy.com/",
    "" # Direct (last resort)
]

def download_file(url, dest_path):
    print(f"Downloading {dest_path.name}...")
    if dest_path.exists():
        if dest_path.stat().st_size > 1024:
            print(f"File {dest_path.name} exists and seems valid, skipping.")
            return
        else:
            print(f"File {dest_path.name} exists but is too small, redownloading.")
            dest_path.unlink()

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    last_error = None
    
    # Try mirrors
    targets = []
    if "github.com" in url:
        for m in MIRRORS:
            if m:
                targets.append(m + url)
            else:
                targets.append(url)
    else:
        targets.append(url)
        
    for target_url in targets:
        try:
            print(f"Trying {target_url}...")
            with requests.get(target_url, stream=True, timeout=60, verify=True) as r:
                r.raise_for_status()
                with open(dest_path, 'wb') as f:
                    downloaded = 0
                    total_size = int(r.headers.get('content-length', 0))
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        # Minimal progress
                        if total_size and downloaded % (1024*1024*5) == 0:
                            print(f".", end="", flush=True)
            print("\nDownload complete.")
            return
        except Exception as e:
            print(f"\nFailed with {target_url}: {e}")
            last_error = e
            if dest_path.exists():
                dest_path.unlink()
            time.sleep(1)
            
    raise last_error

def handle_remove_readonly(func, path, exc):
    excvalue = exc[1]
    if func in (os.rmdir, os.remove) and excvalue.errno == 13:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    else:
        raise

def setup_propainter():
    root_dir = Path(__file__).resolve().parent.parent
    dest_dir = root_dir / "src" / "models" / "propainter_core"
    weights_dir = root_dir / "weights" / "propainter"
    temp_repo_dir = root_dir / "temp_propainter_repo_v4"

    
    print(f"Installing ProPainter core to {dest_dir}")
    print(f"Downloading weights to {weights_dir}")
    
    # 1. Clone Source Code
    try:
        if temp_repo_dir.exists():
            shutil.rmtree(temp_repo_dir, onerror=handle_remove_readonly)

        print(f"Cloning {REPO_URL} (main)...")
        # Try mirror first for better stability in CN
        mirror_url = "https://mirror.ghproxy.com/" + REPO_URL
        print(f"Attempting clone from mirror: {mirror_url}")
        
        try:
             subprocess.check_call(
                ["git", "clone", "--depth", "1", "--recursive", mirror_url, str(temp_repo_dir)],
                cwd=str(root_dir)
            )
        except subprocess.CalledProcessError:
            print("Mirror clone failed, trying direct GitHub...")
            subprocess.check_call(
                ["git", "clone", "--depth", "1", "--recursive", REPO_URL, str(temp_repo_dir)],
                cwd=str(root_dir)
            )
        
        # Debug: List root
        print(f"Repo root contents: {[x.name for x in temp_repo_dir.iterdir()]}")

        # Move extracted folders to destination
        if dest_dir.exists():
            shutil.rmtree(dest_dir)
        dest_dir.mkdir(parents=True)
        
        # Items to copy
        items_to_copy = ["model", "utils", "core", "RAFT"]
        
        for item in items_to_copy:
            src = temp_repo_dir / item
            dst = dest_dir / item
            if src.exists():
                if src.is_dir():
                    shutil.move(str(src), str(dst))
                else:
                    shutil.move(str(src), str(dst))
            else:
                print(f"Warning: '{item}' not found in repo.")

        inference_src = temp_repo_dir / "inference_propainter.py"
        if inference_src.exists():
            shutil.move(str(inference_src), str(dest_dir / "inference.py"))

        # Create __init__.py files
        (dest_dir / "__init__.py").touch()
        for item in items_to_copy:
             if (dest_dir / item).exists() and (dest_dir / item).is_dir():
                 (dest_dir / item / "__init__.py").touch()

            
        print(f"Source code installed to {dest_dir}")
        
    except subprocess.CalledProcessError as e:
        print(f"Git clone failed: {e}")
        raise e
            
    finally:
        # Cleanup
        if temp_repo_dir.exists():
            # retry cleanup if git holds lock
            try:
                shutil.rmtree(temp_repo_dir, onerror=handle_remove_readonly)
            except Exception as e:
                print(f"Warning: Could not delete temp repo dir (locked?): {e}")


    # 2. Download Weights
    weights_dir.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        download_file(f"{WEIGHTS_BASE_URL}/{weight}", weights_dir / weight)
        
    print("ProPainter setup complete.")

if __name__ == "__main__":
    setup_propainter()

import requests
import zipfile
import io
import os

# URL for the zip file containing the models
url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"
dest_dir = "bin/models"
os.makedirs(dest_dir, exist_ok=True)

print(f"Downloading zip from {url}...")
try:
    response = requests.get(url)
    response.raise_for_status()
    print("Download complete. Extracting...")
    
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        # List files to find the correct path
        for file in z.namelist():
            if "realesr-general-x4v3" in file:
                filename = os.path.basename(file)
                if not filename: continue # skip directories
                
                target_path = os.path.join(dest_dir, filename)
                print(f"Extracting {filename} to {target_path}...")
                with open(target_path, "wb") as f:
                    f.write(z.read(file))
                    
    print("Done.")
except Exception as e:
    print(f"Error: {e}")

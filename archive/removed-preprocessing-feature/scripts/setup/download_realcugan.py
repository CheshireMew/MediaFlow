import requests
import zipfile
import io
import os

url = "https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728/realcugan-ncnn-vulkan-20220728-windows.zip"
dest_dir = "bin"
os.makedirs(dest_dir, exist_ok=True)

print(f"Downloading Real-CUGAN from {url}...")
try:
    response = requests.get(url)
    response.raise_for_status()
    print("Download complete. Extracting...")
    
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        # Extract all contents to bin/realcugan-ncnn-vulkan
        # The zip contains a folder "realcugan-ncnn-vulkan-20220728-windows"
        # We want to flatten it or rename it to "realcugan"
        
        root_folder = z.namelist()[0].split('/')[0]
        
        for file in z.namelist():
            if file.endswith('/'): continue
            
            # Remove the root folder from path
            rel_path = file[len(root_folder)+1:]
            if not rel_path: continue
            
            target_path = os.path.join(dest_dir, "realcugan", rel_path)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            
            with open(target_path, "wb") as f:
                f.write(z.read(file))
                    
    print("Done.")
except Exception as e:
    print(f"Error: {e}")

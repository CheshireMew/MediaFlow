import requests
import os

url = "https://download.openmmlab.com/mmedit/restorers/basicvsr_plusplus/basicvsr_plusplus_c64n7_8x1_600k_reds4_20210217-db622b2f.pth"
dest_dir = "bin/models"
os.makedirs(dest_dir, exist_ok=True)
dest_path = os.path.join(dest_dir, "basicvsr_plusplus_c64n7_8x1_600k_reds4.pth")

print(f"Downloading checkpoint from {url}...")
try:
    response = requests.get(url, stream=True)
    response.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print("Download complete.")
except Exception as e:
    print(f"Error: {e}")

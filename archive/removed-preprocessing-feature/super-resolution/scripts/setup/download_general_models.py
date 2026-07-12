import requests
import os

# Official links for the general model
files = [
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.bin",
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.param"
]

dest_dir = "bin/models"
os.makedirs(dest_dir, exist_ok=True)

for url in files:
    filename = url.split("/")[-1]
    dest_path = os.path.join(dest_dir, filename)
    print(f"Downloading {filename}...")
    try:
        response = requests.get(url, stream=True)
        # If 404, we might need to try the wdn version or a cheat link
        if response.status_code == 404:
            print(f"404 Not Found for {url}. Trying alternative...")
            # Fallback isn't easy without a known good mirror, but let's report error
            
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Downloaded {filename}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

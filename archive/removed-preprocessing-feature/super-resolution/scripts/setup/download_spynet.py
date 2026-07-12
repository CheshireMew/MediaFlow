import os
import requests

MODEL_URL = "https://download.openmmlab.com/mmediting/restorers/basicvsr/spynet_20210409-c6c1bd09.pth"
MODEL_DIR = "bin/models"
MODEL_PATH = os.path.join(MODEL_DIR, "spynet_20210409-c6c1bd09.pth")

if not os.path.exists(MODEL_DIR):
    os.makedirs(MODEL_DIR)

if not os.path.exists(MODEL_PATH):
    print(f"Downloading SpyNet model to {MODEL_PATH}...")
    response = requests.get(MODEL_URL, stream=True)
    with open(MODEL_PATH, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print("Download complete.")
else:
    print("Model already exists.")

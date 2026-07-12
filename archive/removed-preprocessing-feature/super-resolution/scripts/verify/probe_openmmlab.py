import requests
from itertools import product

base_url = "https://download.openmmlab.com/mmcv/dist/cu118"
torch_versions = ["torch2.0", "torch2.0.0", "torch2.0.1"]
mmcv_versions = ["1.7.0", "1.7.1", "1.7.2"]

def probe():
    print("Probing OpenMMLab for valid mmcv-full wheels...")
    
    for tv, mv in product(torch_versions, mmcv_versions):
        # mmcv_full-1.7.1-cp310-cp310-win_amd64.whl
        filename = f"mmcv_full-{mv}-cp310-cp310-win_amd64.whl"
        url = f"{base_url}/{tv}/{filename}"
        
        try:
            r = requests.head(url, timeout=2)
            if r.status_code == 200:
                print(f"[FOUND] {url}")
                return
            else:
                print(f"[404] {tv} / {mv}")
        except Exception as e:
            print(f"[ERR] {url}: {e}")

    print("Probe finished.")

if __name__ == "__main__":
    probe()

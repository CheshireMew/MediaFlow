import os
from pathlib import Path

TEMP_DIR = Path(r"e:\Work\Code\Mediaflow\temp")

def clean():
    if not TEMP_DIR.exists():
        print("Temp dir not found")
        return

    count = 0
    size_freed = 0
    for item in TEMP_DIR.glob("*"):
        if item.is_file():
            # Check for watermark-like patterns (UUID_filename.psd or UUID_filename_trimmed.png)
            name = item.name.lower()
            # UUID is 36 chars. +1 for underscore = 37.
            # Simple heuristic: if it contains a UUID-like prefix (hyphens and length)
            is_uuid_prefixed = len(name) > 37 and name[8] == '-' and name[13] == '-' and name[18] == '-' and name[23] == '-'
            
            if is_uuid_prefixed and (name.endswith(".psd") or name.endswith(".png")):
                try:
                    s = item.stat().st_size
                    print(f"Deleting {item.name} ({s} bytes)")
                    os.remove(item)
                    count += 1
                    size_freed += s
                except Exception as e:
                    print(f"Failed to delete {item.name}: {e}")
    
    print(f"Deleted {count} files.")
    print(f"Freed {size_freed / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    clean()

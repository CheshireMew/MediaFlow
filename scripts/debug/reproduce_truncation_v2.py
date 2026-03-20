
from pathlib import Path

def test_truncation(path_str):
    print(f"--- Testing: {path_str} ---")
    path = Path(path_str)
    print(f"Path: {path}")
    print(f"Name: {path.name}")
    print(f"Stem: {path.stem}")
    print(f"Suffix: {path.suffix}")
    print(f"with_suffix(.srt): {path.with_suffix('.srt')}")
    
    # Simulating Translation Case
    stem = path.stem
    suffix = "_CN" # or _CN.srt? NO, translate.py uses "_CN" then calls save_srt
    
    # Case A: translate.py passes stem+suffix (no extension)
    save_path_str = f"{path.parent}\\{stem}{suffix}"
    save_path = Path(save_path_str)
    print(f"Translate Save Input: {save_path}")
    print(f"Translate Save Suffix: {save_path.suffix}")
    print(f"Translate Result (with_suffix): {save_path.with_suffix('.srt')}")

print("=== Standard File ===")
test_truncation(r"C:\Users\Dylan\Videos\Movie.mp4")

print("\n=== File with Dots ===")
test_truncation(r"C:\Users\Dylan\Videos\Shay Boloor... electricity... [2023].mp4")

print("\n=== File with Dots and No Extension (Hypothetical) ===")
test_truncation(r"C:\Users\Dylan\Videos\Shay Boloor... electricity... [2023]")

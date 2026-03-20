
from pathlib import Path

def test_truncation(path_str):
    path = Path(path_str)
    stem = path.stem
    srt_path = path.with_suffix(".srt")
    print(f"Original: {path_str}")
    print(f"Stem: {stem}")
    print(f"Suffix: {path.suffix}")
    print(f"Result: {srt_path}")

test_truncation(r"C:\Users\Dylan\Videos\Shay Boloor - Former $GOOGL ... electricity... [2023035630335508480].mp4")

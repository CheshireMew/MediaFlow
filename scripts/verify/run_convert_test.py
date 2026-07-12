import argparse
import sys
from pathlib import Path

# Add project root to python path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.utils.subtitle_parser import SubtitleParser


def convert_vtt(target_file: Path) -> None:
    print(f"Targeting file: {target_file}")
    if not target_file.is_file():
        raise FileNotFoundError(f"VTT file not found: {target_file}")

    output_path = SubtitleParser.process_vtt_file(target_file)
    if output_path is None:
        raise RuntimeError(f"VTT conversion failed: {target_file}")
    print(f"Converted subtitle: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert one VTT subtitle to SRT.")
    parser.add_argument("vtt_path", type=Path)
    args = parser.parse_args()
    convert_vtt(args.vtt_path)

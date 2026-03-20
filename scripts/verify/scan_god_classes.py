
import os
from pathlib import Path

# Directories to scan
TARGET_DIRS = ["backend", "frontend/src"]
# Exclude list
EXCLUDES = ["node_modules", ".git", "__pycache__", "dist", "build", "generated"]

def count_lines(file_path):
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0

def scan_files():
    file_stats = []
    base_dir = Path(__file__).resolve().parents[2]

    for target in TARGET_DIRS:
        target_path = base_dir / target
        if not target_path.exists():
            print(f"Directory {target} not found.")
            continue
            
        for root, dirs, files in os.walk(target_path):
            # Filtering directories
            dirs[:] = [d for d in dirs if d not in EXCLUDES]
            
            for file in files:
                if file.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss")):
                    file_path = Path(root) / file
                    loc = count_lines(file_path)
                    file_stats.append((str(file_path.relative_to(base_dir)), loc))
    
    # Sort by LOC descending
    file_stats.sort(key=lambda x: x[1], reverse=True)
    
    print("\nTop 20 Largest Files (Lines of Code):")
    print("-" * 60)
    for path, loc in file_stats[:20]:
        print(f"{loc:<6} {path}")

if __name__ == "__main__":
    scan_files()

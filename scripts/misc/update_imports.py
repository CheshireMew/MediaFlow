import os
from pathlib import Path

DIRS = ["backend", "scripts", "tests"]

def replace_imports(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content.replace("from backend.", "from backend.")
        new_content = new_content.replace("import backend.", "import backend.")
        new_content = new_content.replace("from backend ", "from backend ")
        new_content = new_content.replace("import src\n", "import backend\n")
        
        if content != new_content:
            print(f"Updating {file_path}")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
    except Exception as e:
        print(f"Error processing {file_path}: {e}")

def main():
    base_dir = str(Path(__file__).resolve().parents[2])
    for d in DIRS:
        target_dir = os.path.join(base_dir, d)
        if not os.path.exists(target_dir):
            print(f"Skipping {d} (not found)")
            continue
            
        for root, _, files in os.walk(target_dir):
            for file in files:
                if file.endswith(".py"):
                    replace_imports(os.path.join(root, file))

if __name__ == "__main__":
    main()

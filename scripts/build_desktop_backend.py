import os
import subprocess
import sys
from pathlib import Path


def build() -> None:
    root_dir = Path(__file__).resolve().parents[1]
    entry_path = root_dir / "run.py"
    dist_path = root_dir / "dist-desktop-backend"
    work_path = root_dir / "build-desktop-backend"
    contracts_path = root_dir / "contracts"

    if not entry_path.exists():
        raise FileNotFoundError(f"Backend entrypoint not found: {entry_path}")
    if not contracts_path.exists():
        raise FileNotFoundError(f"Runtime contracts not found: {contracts_path}")

    add_data_separator = ";" if os.name == "nt" else ":"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            str(entry_path),
            "--name",
            "mediaflow-backend",
            "--onedir",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(dist_path),
            "--workpath",
            str(work_path),
            "--add-data",
            f"{contracts_path}{add_data_separator}contracts",
            "--hidden-import",
            "backend.application.task_definitions",
        ],
        cwd=root_dir,
        check=True,
        env=os.environ.copy(),
    )


if __name__ == "__main__":
    print("Starting PyInstaller build for MediaFlow backend runtime...")
    build()
    print("Build completed successfully! Outputs are in dist-desktop-backend/mediaflow-backend")

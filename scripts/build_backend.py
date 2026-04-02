import os
import subprocess
import sys
from pathlib import Path


def build() -> None:
    root_dir = Path(__file__).resolve().parents[1]
    spec_path = root_dir / "mediaflow-backend.spec"
    dist_path = root_dir / "dist-backend"
    work_path = root_dir / "build-backend"
    if not spec_path.exists():
        raise FileNotFoundError(f"PyInstaller spec not found: {spec_path}")

    env = os.environ.copy()
    env.setdefault("ENABLE_EXPERIMENTAL_PREPROCESSING", "false")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            str(spec_path),
            "--noconfirm",
            "--clean",
            "--distpath",
            str(dist_path),
            "--workpath",
            str(work_path),
        ],
        cwd=root_dir,
        check=True,
        env=env,
    )

if __name__ == "__main__":
    print(f"Starting PyInstaller build for MediaFlow Backend...")
    build()
    print(f"Build completed successfully! Outputs are in dist-backend/mediaflow-backend")

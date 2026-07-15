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
    pyinstaller_config_path = root_dir / ".tmp" / "pyinstaller"

    if not entry_path.exists():
        raise FileNotFoundError(f"Backend entrypoint not found: {entry_path}")
    if not contracts_path.exists():
        raise FileNotFoundError(f"Runtime contracts not found: {contracts_path}")

    add_data_separator = ";" if os.name == "nt" else ":"
    pyinstaller_config_path.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("PYINSTALLER_CONFIG_DIR", str(pyinstaller_config_path))

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
            "--collect-submodules",
            "backend.application.pipeline_steps",
            "--hidden-import",
            "backend.runtime.service_registry",
        ],
        cwd=root_dir,
        check=True,
        env=env,
    )


if __name__ == "__main__":
    print("Starting PyInstaller build for MediaFlow backend runtime...")
    build()
    print("Build completed successfully! Outputs are in dist-desktop-backend/mediaflow-backend")

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def _allocate_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def _wait_for_ready(url: str, process: subprocess.Popen[str], timeout: float = 90) -> dict:
    deadline = time.monotonic() + timeout
    last_status = "unreachable"
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(f"Production backend exited before readiness with code {exit_code}")
        try:
            with urlopen(url, timeout=2) as response:
                payload = json.load(response)
            last_status = str(payload.get("status") or "missing")
            if response.status == 200 and last_status == "ready":
                return payload
        except HTTPError as exc:
            try:
                last_status = str(json.load(exc).get("status") or f"HTTP {exc.code}")
            except Exception:
                last_status = f"HTTP {exc.code}"
        except (OSError, URLError, ValueError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"Production backend did not become ready; last status: {last_status}")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    executable = root / "dist-desktop-backend" / "mediaflow-backend" / "mediaflow-backend.exe"
    if not executable.is_file():
        raise FileNotFoundError(f"Production backend executable not found: {executable}")

    port = _allocate_port()
    runtime_root = root / ".tmp" / f"mediaflow-backend-smoke-{os.getpid()}"
    environment = os.environ.copy()
    environment.update(
        {
            "PORT": str(port),
            "MEDIAFLOW_RUNTIME_DIR": str(runtime_root),
            "MEDIAFLOW_RUNTIME_MAX_MANAGED_BYTES": str(4 * 1024 * 1024 * 1024),
            "MEDIAFLOW_RUNTIME_MIN_FREE_BYTES": str(512 * 1024 * 1024),
        }
    )
    process = subprocess.Popen(
        [str(executable)],
        cwd=runtime_root.parent,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        payload = _wait_for_ready(f"http://127.0.0.1:{port}/health", process)
        print(f"Production backend ready: {payload}")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        output = process.stdout.read() if process.stdout else ""
        if process.returncode not in {0, 1} and output:
            print(output[-8000:], file=sys.stderr)


if __name__ == "__main__":
    main()

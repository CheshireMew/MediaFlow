from __future__ import annotations

import os
import re
import shutil
import site
import subprocess
import sys
from pathlib import Path

from backend.models.settings_contracts import (
    CudaReadinessResponse,
    RuntimeDependencyCheck,
)


class RuntimeDiagnosticsService:
    CUDA_RUNTIME_DLL = "cudart64_12.dll"
    CUBLAS_DLL = "cublas64_12.dll"
    CUDNN_DLL = "cudnn64_9.dll"
    CUDA_RUNTIME_ERROR_MARKERS = (
        "cublas64",
        "cudnn",
        "cudart",
        "cuda failed",
        "cuda driver version is insufficient",
        "no cuda",
        "cannot be loaded",
    )

    @classmethod
    def is_cuda_runtime_unavailable_error(cls, error: Exception) -> bool:
        message = str(error).lower()
        if "cannot be loaded" in message and not any(
            marker in message for marker in ("cuda", "cublas", "cudnn", "cudart")
        ):
            return False
        return any(marker in message for marker in cls.CUDA_RUNTIME_ERROR_MARKERS)

    def cuda_readiness(self) -> CudaReadinessResponse:
        gpu, gpu_name, driver_version = self._probe_nvidia_driver()
        dependencies = [
            gpu,
            self._probe_dll(
                key="cuda_runtime",
                label="CUDA 12 runtime",
                dll_name=self.CUDA_RUNTIME_DLL,
            ),
            self._probe_dll(
                key="cublas",
                label="cuBLAS for CUDA 12",
                dll_name=self.CUBLAS_DLL,
            ),
            self._probe_dll(
                key="cudnn",
                label="cuDNN 9 for CUDA 12",
                dll_name=self.CUDNN_DLL,
            ),
        ]

        blocking = [item for item in dependencies if item.status != "ready"]
        if blocking:
            summary = "CUDA is not ready for built-in faster-whisper transcription."
            status = "not_ready"
        else:
            summary = "CUDA is ready for built-in faster-whisper transcription."
            status = "ready"

        return CudaReadinessResponse(
            status=status,
            summary=summary,
            gpu_name=gpu_name,
            driver_version=driver_version,
            driver_cuda_capability=self._driver_cuda_capability(),
            dependencies=dependencies,
            install_guidance=self._install_guidance(blocking),
        )

    def _probe_nvidia_driver(self) -> tuple[RuntimeDependencyCheck, str | None, str | None]:
        nvidia_smi = shutil.which("nvidia-smi")
        if not nvidia_smi:
            return (
                RuntimeDependencyCheck(
                    key="nvidia_driver",
                    label="NVIDIA driver",
                    status="missing",
                    detail="nvidia-smi was not found in PATH.",
                ),
                None,
                None,
            )

        try:
            result = subprocess.run(
                [
                    nvidia_smi,
                    "--query-gpu=name,driver_version",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return (
                RuntimeDependencyCheck(
                    key="nvidia_driver",
                    label="NVIDIA driver",
                    status="unknown",
                    detail=f"nvidia-smi could not be executed: {exc}",
                    path=nvidia_smi,
                ),
                None,
                None,
            )

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "nvidia-smi failed").strip()
            return (
                RuntimeDependencyCheck(
                    key="nvidia_driver",
                    label="NVIDIA driver",
                    status="missing",
                    detail=detail,
                    path=nvidia_smi,
                ),
                None,
                None,
            )

        first_line = (result.stdout or "").strip().splitlines()[0]
        parts = [part.strip() for part in first_line.split(",", 1)]
        gpu_name = parts[0] if parts else None
        driver_version = parts[1] if len(parts) > 1 else None
        return (
            RuntimeDependencyCheck(
                key="nvidia_driver",
                label="NVIDIA driver",
                status="ready",
                detail=f"Detected {gpu_name or 'NVIDIA GPU'}.",
                path=nvidia_smi,
                version=driver_version,
            ),
            gpu_name,
            driver_version,
        )

    def _driver_cuda_capability(self) -> str | None:
        nvidia_smi = shutil.which("nvidia-smi")
        if not nvidia_smi:
            return None
        try:
            result = subprocess.run(
                [nvidia_smi],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        match = re.search(r"CUDA Version:\s*([0-9.]+)", result.stdout or "")
        return match.group(1) if match else None

    def _probe_dll(self, *, key: str, label: str, dll_name: str) -> RuntimeDependencyCheck:
        path_match = self._find_dll_on_path(dll_name)
        if path_match:
            return RuntimeDependencyCheck(
                key=key,
                label=label,
                status="ready",
                detail=f"{dll_name} is available in PATH.",
                path=str(path_match),
            )

        known_match = self._find_known_dll_location(dll_name)
        if known_match:
            return RuntimeDependencyCheck(
                key=key,
                label=label,
                status="not_on_path",
                detail=f"{dll_name} exists but is not visible to the current backend process PATH.",
                path=str(known_match),
            )

        return RuntimeDependencyCheck(
            key=key,
            label=label,
            status="missing",
            detail=f"{dll_name} was not found.",
        )

    @staticmethod
    def _find_dll_on_path(dll_name: str) -> Path | None:
        for raw_entry in os.environ.get("PATH", "").split(os.pathsep):
            if not raw_entry:
                continue
            candidate = Path(raw_entry) / dll_name
            if candidate.exists():
                return candidate
        return None

    def _find_known_dll_location(self, dll_name: str) -> Path | None:
        candidates: list[Path] = []
        candidates.extend(self._cuda_toolkit_candidates(dll_name))
        candidates.extend(self._cudnn_candidates(dll_name))
        candidates.extend(self._python_package_candidates(dll_name))
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def _cuda_toolkit_candidates(self, dll_name: str) -> list[Path]:
        roots: list[Path] = []
        cuda_path = os.environ.get("CUDA_PATH")
        if cuda_path:
            roots.append(Path(cuda_path))

        for name, value in os.environ.items():
            if name.startswith("CUDA_PATH_V") and value:
                roots.append(Path(value))

        program_files = os.environ.get("ProgramFiles")
        if program_files:
            toolkit_root = Path(program_files) / "NVIDIA GPU Computing Toolkit" / "CUDA"
            if toolkit_root.exists():
                roots.extend(path for path in toolkit_root.glob("v*") if path.is_dir())

        return [root / "bin" / dll_name for root in roots]

    def _cudnn_candidates(self, dll_name: str) -> list[Path]:
        candidates: list[Path] = []
        program_files = os.environ.get("ProgramFiles")
        if not program_files:
            return candidates

        cudnn_root = Path(program_files) / "NVIDIA" / "CUDNN"
        if cudnn_root.exists():
            candidates.extend(cudnn_root.glob(f"**/bin/{dll_name}"))
            candidates.extend(cudnn_root.glob(f"**/bin/**/{dll_name}"))
        return candidates

    def _python_package_candidates(self, dll_name: str) -> list[Path]:
        roots: list[Path] = []
        for raw_root in [*site.getsitepackages(), site.getusersitepackages(), *sys.path]:
            if not raw_root:
                continue
            path = Path(raw_root)
            if path.exists() and path not in roots:
                roots.append(path)

        candidates: list[Path] = []
        for root in roots:
            nvidia_root = root / "nvidia"
            if not nvidia_root.exists():
                continue
            candidates.extend(nvidia_root.glob(f"*/bin/{dll_name}"))
            candidates.extend(nvidia_root.glob(f"*/lib/{dll_name}"))
        return candidates

    @staticmethod
    def _install_guidance(blocking: list[RuntimeDependencyCheck]) -> list[str]:
        if not blocking:
            return [
                "CUDA is ready. Use device=cuda for built-in transcription.",
            ]

        keys = {item.key for item in blocking}
        guidance: list[str] = []
        if "nvidia_driver" in keys:
            guidance.append("Install or repair the NVIDIA display driver, then confirm nvidia-smi works.")
        if {"cuda_runtime", "cublas"} & keys:
            guidance.append(
                "Install NVIDIA CUDA Toolkit 12.x and ensure its bin directory is in PATH."
            )
        if "cudnn" in keys:
            guidance.append(
                "Install NVIDIA cuDNN 9 for CUDA 12 and ensure the cuDNN bin directory is in PATH."
            )
        if any(item.status == "not_on_path" for item in blocking):
            guidance.append("Restart the backend after changing PATH so the process sees the new DLL directories.")
        guidance.append("CPU transcription remains available while CUDA dependencies are incomplete.")
        return guidance

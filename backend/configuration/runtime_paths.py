from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, MutableMapping

from backend.configuration.defaults import RUNTIME_DIR_ENV


@dataclass(frozen=True)
class RuntimePaths:
    RESOURCE_DIR: Path
    RUNTIME_DIR: Path
    WORKSPACE_DIR: Path
    TEMP_DIR: Path
    MODEL_DIR: Path
    OUTPUT_DIR: Path
    USER_DATA_DIR: Path
    TOOL_DIR: Path
    TOOL_DOWNLOAD_DIR: Path
    PYTHON_TOOL_PACKAGES_DIR: Path
    CACHE_DIR: Path
    HUGGINGFACE_CACHE_DIR: Path
    MODELSCOPE_CACHE_DIR: Path
    PIP_CACHE_DIR: Path
    BIN_DIR: Path
    ASR_MODEL_DIR: Path

    def tool_file_candidates(self, *parts: str) -> list[Path]:
        return [self.TOOL_DIR.joinpath(*parts), self.BIN_DIR.joinpath(*parts)]


def resolve_resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent.parent
    return Path(__file__).resolve().parents[2]


def _resolve_runtime_dir(resource_dir: Path, environ: Mapping[str, str]) -> Path:
    configured = environ.get(RUNTIME_DIR_ENV)
    if configured:
        return Path(configured).expanduser().resolve()
    if not getattr(sys, "frozen", False):
        return resource_dir
    if os.name == "nt" and Path("D:/").exists():
        return Path("D:/Tools/MediaFlow/runtime")
    appdata = environ.get("APPDATA") or environ.get("LOCALAPPDATA")
    if appdata:
        return Path(appdata).expanduser().resolve() / "mediaflow-ui" / "runtime"
    return Path.home().resolve() / ".mediaflow-ui" / "runtime"


def build_runtime_paths(environ: Mapping[str, str]) -> RuntimePaths:
    resource_dir = resolve_resource_dir()
    runtime_dir = _resolve_runtime_dir(resource_dir, environ)
    tool_dir = runtime_dir / "tools"
    cache_dir = runtime_dir / ".cache"
    model_dir = runtime_dir / "models"
    return RuntimePaths(
        RESOURCE_DIR=resource_dir,
        RUNTIME_DIR=runtime_dir,
        WORKSPACE_DIR=runtime_dir / "workspace",
        TEMP_DIR=runtime_dir / ".temp",
        MODEL_DIR=model_dir,
        OUTPUT_DIR=runtime_dir / "output",
        USER_DATA_DIR=runtime_dir / "user_data",
        TOOL_DIR=tool_dir,
        TOOL_DOWNLOAD_DIR=tool_dir / "downloads",
        PYTHON_TOOL_PACKAGES_DIR=tool_dir / "python-packages",
        CACHE_DIR=cache_dir,
        HUGGINGFACE_CACHE_DIR=cache_dir / "huggingface",
        MODELSCOPE_CACHE_DIR=cache_dir / "modelscope",
        PIP_CACHE_DIR=cache_dir / "pip",
        BIN_DIR=resource_dir / "bin",
        ASR_MODEL_DIR=model_dir / "faster-whisper",
    )


def detect_binary_paths(
    paths: RuntimePaths,
    *,
    ffmpeg_path: str,
    ffprobe_path: str,
    faster_whisper_cli_path: str,
) -> tuple[str, str, str]:
    local_ffmpeg = paths.BIN_DIR / "ffmpeg.exe"
    if local_ffmpeg.exists():
        ffmpeg_path = str(local_ffmpeg)
    local_ffprobe = paths.BIN_DIR / "ffprobe.exe"
    if local_ffprobe.exists():
        ffprobe_path = str(local_ffprobe)
    for candidate in paths.tool_file_candidates("Faster-Whisper-XXL", "faster-whisper-xxl.exe"):
        if not faster_whisper_cli_path and candidate.exists():
            faster_whisper_cli_path = str(candidate)
            break
    for candidate in paths.tool_file_candidates("Faster-Whisper-XXL", "ffmpeg.exe"):
        if ffmpeg_path == "ffmpeg" and candidate.exists():
            ffmpeg_path = str(candidate)
            break
    return ffmpeg_path, ffprobe_path, faster_whisper_cli_path


def initialize_runtime_directories(settings) -> None:
    for name in (
        "WORKSPACE_DIR", "TEMP_DIR", "MODEL_DIR", "OUTPUT_DIR", "USER_DATA_DIR",
        "TOOL_DIR", "TOOL_DOWNLOAD_DIR", "PYTHON_TOOL_PACKAGES_DIR", "CACHE_DIR",
        "HUGGINGFACE_CACHE_DIR", "MODELSCOPE_CACHE_DIR", "PIP_CACHE_DIR",
    ):
        getattr(settings, name).mkdir(parents=True, exist_ok=True)
    (settings.USER_DATA_DIR / "watermarks").mkdir(exist_ok=True)


def prepare_runtime_environment(
    settings,
    *,
    environ: MutableMapping[str, str],
    python_path: list[str],
) -> None:
    initialize_runtime_directories(settings)
    environ.setdefault("HF_HOME", str(settings.HUGGINGFACE_CACHE_DIR))
    environ.setdefault("HUGGINGFACE_HUB_CACHE", str(settings.HUGGINGFACE_CACHE_DIR / "hub"))
    environ.setdefault("MODELSCOPE_CACHE", str(settings.MODELSCOPE_CACHE_DIR))
    environ.setdefault("PIP_CACHE_DIR", str(settings.PIP_CACHE_DIR))
    package_path = str(settings.PYTHON_TOOL_PACKAGES_DIR)
    if package_path not in python_path:
        python_path.insert(0, package_path)

from __future__ import annotations

import os
import sys
from pathlib import Path

from backend.configuration.defaults import (
    DEFAULT_ASR_MODELS,
    DEFAULT_DOWNLOADER_FORMATS,
    RUNTIME_DIR_ENV,
    RUNTIME_MAX_MANAGED_BYTES_ENV,
    RUNTIME_MIN_FREE_BYTES_ENV,
)
from backend.configuration.environment import (
    load_env_file as _load_env_file,
    load_settings_values,
)
from backend.configuration.runtime_paths import (
    build_runtime_paths,
    detect_binary_paths,
    initialize_runtime_directories,
    prepare_runtime_environment,
)


class Settings:
    """Mutable compatibility facade over cohesive configuration owners."""

    def __init__(self):
        paths = build_runtime_paths(os.environ)
        values = load_settings_values(
            paths.RESOURCE_DIR,
            os.environ,
            file_loader=_load_env_file,
        )
        for name, value in vars(paths).items():
            setattr(self, name, value)
        for name, value in vars(values).items():
            setattr(self, name, value)

        (
            self.FFMPEG_PATH,
            self.FFPROBE_PATH,
            self.FASTER_WHISPER_CLI_PATH,
        ) = detect_binary_paths(
            paths,
            ffmpeg_path=self.FFMPEG_PATH,
            ffprobe_path=self.FFPROBE_PATH,
            faster_whisper_cli_path=self.FASTER_WHISPER_CLI_PATH,
        )
        self._runtime_paths = paths

    def tool_file_candidates(self, *parts: str) -> list[Path]:
        return [
            self.TOOL_DIR.joinpath(*parts),
            self.BIN_DIR.joinpath(*parts),
        ]

    def first_existing_tool_file(self, *parts: str) -> Path | None:
        return next(
            (candidate for candidate in self.tool_file_candidates(*parts) if candidate.exists()),
            None,
        )

    def init_dirs(self) -> None:
        initialize_runtime_directories(self)

    def prepare_runtime_environment(self) -> None:
        prepare_runtime_environment(self, environ=os.environ, python_path=sys.path)


settings = Settings()


__all__ = [
    "DEFAULT_ASR_MODELS",
    "DEFAULT_DOWNLOADER_FORMATS",
    "RUNTIME_DIR_ENV",
    "RUNTIME_MAX_MANAGED_BYTES_ENV",
    "RUNTIME_MIN_FREE_BYTES_ENV",
    "Settings",
    "settings",
]

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping

from backend.configuration.defaults import (
    DEFAULT_ASR_MODELS,
    DEFAULT_DOWNLOADER_FORMATS,
    RUNTIME_MAX_MANAGED_BYTES_ENV,
    RUNTIME_MIN_FREE_BYTES_ENV,
)


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def _parse_bool(value: str | None, default: bool) -> bool:
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, default: int) -> int:
    try:
        return default if value is None else int(value)
    except (TypeError, ValueError):
        return default


def _parse_log_level(value: str | None, default: str) -> str:
    normalized = value.strip().upper() if value else default
    allowed = {"TRACE", "DEBUG", "INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"}
    return normalized if normalized in allowed else default


def _parse_json_dict(value: str | None, default: dict) -> dict:
    if value is None:
        return default.copy()
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default.copy()
    return parsed if isinstance(parsed, dict) else default.copy()


@dataclass
class SettingsValues:
    APP_NAME: str = "MediaFlow Core"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    ENABLE_DETAILED_LLM_LOGGING: bool = False
    HOST: str = "127.0.0.1"
    PORT: int = 8800
    TASK_MAX_CONCURRENT: int = 2
    TASK_HISTORY_LIMIT: int = 100
    RUNTIME_MAX_MANAGED_BYTES: int = 200 * 1024 * 1024 * 1024
    RUNTIME_MIN_FREE_BYTES: int = 5 * 1024 * 1024 * 1024
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    FASTER_WHISPER_CLI_PATH: str = ""
    ENABLE_FASTER_WHISPER_CLI: bool = False
    ASR_MAX_WORKERS: int = 2
    LLM_TRANSLATION_MAX_CONCURRENCY: int = 3
    LLM_MODEL: str = "gpt-4o-mini"
    ASR_MODELS: dict = field(default_factory=lambda: DEFAULT_ASR_MODELS.copy())
    DOWNLOADER_PROXY: str = ""
    DOWNLOADER_FORMATS: dict = field(default_factory=lambda: DEFAULT_DOWNLOADER_FORMATS.copy())


def load_settings_values(
    resource_dir: Path,
    environ: Mapping[str, str],
    *,
    file_loader: Callable[[Path], dict[str, str]] = load_env_file,
) -> SettingsValues:
    defaults = SettingsValues()
    env = {**file_loader(resource_dir / ".env"), **environ}
    debug = _parse_bool(env.get("DEBUG"), defaults.DEBUG)
    return SettingsValues(
        APP_NAME=env.get("APP_NAME", defaults.APP_NAME),
        APP_VERSION=env.get("APP_VERSION", defaults.APP_VERSION),
        DEBUG=debug,
        LOG_LEVEL=_parse_log_level(env.get("LOG_LEVEL"), "DEBUG" if debug else defaults.LOG_LEVEL),
        ENABLE_DETAILED_LLM_LOGGING=_parse_bool(
            env.get("ENABLE_DETAILED_LLM_LOGGING"), defaults.ENABLE_DETAILED_LLM_LOGGING
        ),
        HOST=env.get("HOST", defaults.HOST),
        PORT=_parse_int(env.get("PORT"), defaults.PORT),
        TASK_MAX_CONCURRENT=_parse_int(
            env.get("TASK_MAX_CONCURRENT"), defaults.TASK_MAX_CONCURRENT
        ),
        TASK_HISTORY_LIMIT=max(
            1, _parse_int(env.get("TASK_HISTORY_LIMIT"), defaults.TASK_HISTORY_LIMIT)
        ),
        RUNTIME_MAX_MANAGED_BYTES=max(
            1,
            _parse_int(
                env.get(RUNTIME_MAX_MANAGED_BYTES_ENV), defaults.RUNTIME_MAX_MANAGED_BYTES
            ),
        ),
        RUNTIME_MIN_FREE_BYTES=max(
            0,
            _parse_int(
                env.get(RUNTIME_MIN_FREE_BYTES_ENV), defaults.RUNTIME_MIN_FREE_BYTES
            ),
        ),
        FFMPEG_PATH=env.get("FFMPEG_PATH", defaults.FFMPEG_PATH),
        FFPROBE_PATH=env.get("FFPROBE_PATH", defaults.FFPROBE_PATH),
        FASTER_WHISPER_CLI_PATH=env.get(
            "FASTER_WHISPER_CLI_PATH", defaults.FASTER_WHISPER_CLI_PATH
        ),
        ENABLE_FASTER_WHISPER_CLI=_parse_bool(
            env.get("ENABLE_FASTER_WHISPER_CLI"), defaults.ENABLE_FASTER_WHISPER_CLI
        ),
        ASR_MAX_WORKERS=_parse_int(env.get("ASR_MAX_WORKERS"), defaults.ASR_MAX_WORKERS),
        LLM_TRANSLATION_MAX_CONCURRENCY=_parse_int(
            env.get("LLM_TRANSLATION_MAX_CONCURRENCY"),
            defaults.LLM_TRANSLATION_MAX_CONCURRENCY,
        ),
        LLM_MODEL=env.get("LLM_MODEL", defaults.LLM_MODEL),
        ASR_MODELS=_parse_json_dict(env.get("ASR_MODELS"), DEFAULT_ASR_MODELS),
        DOWNLOADER_PROXY=env.get("DOWNLOADER_PROXY", defaults.DOWNLOADER_PROXY),
        DOWNLOADER_FORMATS=_parse_json_dict(
            env.get("DOWNLOADER_FORMATS"), DEFAULT_DOWNLOADER_FORMATS
        ),
    )

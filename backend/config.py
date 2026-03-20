from pathlib import Path
import json
import os
import sys


DEFAULT_ASR_MODELS = {
    "tiny": "pengzhendong/faster-whisper-tiny",
    "base": "pengzhendong/faster-whisper-base",
    "small": "pengzhendong/faster-whisper-small",
    "medium": "pengzhendong/faster-whisper-medium",
    "large-v1": "pengzhendong/faster-whisper-large-v1",
    "large-v2": "pengzhendong/faster-whisper-large-v2",
    "large-v3": "pengzhendong/faster-whisper-large-v3",
    "large-v3-turbo": "pengzhendong/faster-whisper-large-v3-turbo",
}

DEFAULT_DOWNLOADER_FORMATS = {
    "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
    "4k": "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/mp4",
    "2k": "bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/mp4",
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/mp4",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/mp4",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/mp4",
    "audio": "bestaudio[ext=m4a]/bestaudio/best",
}


def _load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        values[key] = value

    return values


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_json_dict(value: str | None, default: dict) -> dict:
    if value is None:
        return default.copy()
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return default.copy()


class Settings:
    def __init__(self):
        self.APP_NAME = "MediaFlow Core"
        self.APP_VERSION = "0.1.0"
        self.DEBUG = False
        self.ENABLE_EXPERIMENTAL_PREPROCESSING = not getattr(sys, "frozen", False)

        self.HOST = "127.0.0.1"
        self.PORT = 8800
        self.TASK_MAX_CONCURRENT = 2

        if getattr(sys, "frozen", False):
            self.BASE_DIR = Path(sys.executable).resolve().parent.parent
        else:
            self.BASE_DIR = Path(__file__).resolve().parent.parent

        self.WORKSPACE_DIR = self.BASE_DIR / "workspace"
        self.TEMP_DIR = self.BASE_DIR / ".temp"
        self.MODEL_DIR = self.BASE_DIR / "models"
        self.OUTPUT_DIR = self.BASE_DIR / "output"
        self.USER_DATA_DIR = self.BASE_DIR / "user_data"
        self.BIN_DIR = self.BASE_DIR / "bin"

        self.FFMPEG_PATH = "ffmpeg"
        self.FFPROBE_PATH = "ffprobe"
        self.FASTER_WHISPER_CLI_PATH = ""

        self.ASR_MAX_WORKERS = 2
        self.ASR_MODEL_DIR = self.MODEL_DIR / "faster-whisper"
        self.OCR_MODEL_DIR = self.MODEL_DIR / "ocr"

        self.LLM_MODEL = "gpt-4o-mini"
        self.ASR_MODELS = DEFAULT_ASR_MODELS.copy()
        self.DOWNLOADER_PROXY = ""
        self.DOWNLOADER_FORMATS = DEFAULT_DOWNLOADER_FORMATS.copy()

        self._apply_env()
        self._auto_detect_binaries()
        self.init_dirs()

    def _apply_env(self):
        env_file = self.BASE_DIR / ".env"
        env = {**_load_env_file(env_file), **os.environ}

        self.APP_NAME = env.get("APP_NAME", self.APP_NAME)
        self.APP_VERSION = env.get("APP_VERSION", self.APP_VERSION)
        self.DEBUG = _parse_bool(env.get("DEBUG"), self.DEBUG)
        self.ENABLE_EXPERIMENTAL_PREPROCESSING = _parse_bool(
            env.get("ENABLE_EXPERIMENTAL_PREPROCESSING"),
            self.ENABLE_EXPERIMENTAL_PREPROCESSING,
        )

        self.HOST = env.get("HOST", self.HOST)
        self.PORT = _parse_int(env.get("PORT"), self.PORT)
        self.TASK_MAX_CONCURRENT = _parse_int(
            env.get("TASK_MAX_CONCURRENT"),
            self.TASK_MAX_CONCURRENT,
        )

        self.FFMPEG_PATH = env.get("FFMPEG_PATH", self.FFMPEG_PATH)
        self.FFPROBE_PATH = env.get("FFPROBE_PATH", self.FFPROBE_PATH)
        self.FASTER_WHISPER_CLI_PATH = env.get(
            "FASTER_WHISPER_CLI_PATH",
            self.FASTER_WHISPER_CLI_PATH,
        )

        self.ASR_MAX_WORKERS = _parse_int(env.get("ASR_MAX_WORKERS"), self.ASR_MAX_WORKERS)
        self.LLM_MODEL = env.get("LLM_MODEL", self.LLM_MODEL)
        self.ASR_MODELS = _parse_json_dict(env.get("ASR_MODELS"), DEFAULT_ASR_MODELS)
        self.DOWNLOADER_PROXY = env.get("DOWNLOADER_PROXY", self.DOWNLOADER_PROXY)
        self.DOWNLOADER_FORMATS = _parse_json_dict(
            env.get("DOWNLOADER_FORMATS"),
            DEFAULT_DOWNLOADER_FORMATS,
        )

    def _auto_detect_binaries(self):
        local_ffmpeg = self.BIN_DIR / "ffmpeg.exe"
        if local_ffmpeg.exists():
            self.FFMPEG_PATH = str(local_ffmpeg)

        local_ffprobe = self.BIN_DIR / "ffprobe.exe"
        if local_ffprobe.exists():
            self.FFPROBE_PATH = str(local_ffprobe)

    def init_dirs(self):
        for path in [
            self.WORKSPACE_DIR,
            self.TEMP_DIR,
            self.MODEL_DIR,
            self.OUTPUT_DIR,
            self.USER_DATA_DIR,
            self.BIN_DIR,
            self.OCR_MODEL_DIR,
        ]:
            path.mkdir(parents=True, exist_ok=True)

        (self.USER_DATA_DIR / "watermarks").mkdir(exist_ok=True)


settings = Settings()

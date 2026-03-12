from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

import sys

class Settings(BaseSettings):
    # App Info
    APP_NAME: str = "MediaFlow Core"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8800
    
    # Paths
    # When deployed via PyInstaller in Electron, sys.executable is inside `resources/backend/`
    # We want BASE_DIR to be `resources/` so it finds `models/` and `bin/` natively.
    if getattr(sys, 'frozen', False):
        BASE_DIR: Path = Path(sys.executable).resolve().parent.parent
    else:
        BASE_DIR: Path = Path(__file__).resolve().parent.parent
        
    WORKSPACE_DIR: Path = BASE_DIR / "workspace"
    TEMP_DIR: Path = BASE_DIR / ".temp"  # Hidden temp dir for internal cache
    MODEL_DIR: Path = BASE_DIR / "models"
    OUTPUT_DIR: Path = BASE_DIR / "output"
    USER_DATA_DIR: Path = BASE_DIR / "user_data"
    BIN_DIR: Path = BASE_DIR / "bin"
    
    # Executables
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    
    # Faster Whisper CLI
    FASTER_WHISPER_CLI_PATH: str = ""  # Set via .env: FASTER_WHISPER_CLI_PATH=D:\path\to\faster-whisper-xxl.exe

    # ASR Settings
    ASR_MAX_WORKERS: int = 2
    ASR_MODEL_DIR: Path = BASE_DIR / "models" / "faster-whisper"
    OCR_MODEL_DIR: Path = BASE_DIR / "models" / "ocr"

    
    # Model Map (Can be overridden by env var ASR_MODELS='{"tiny":"..."}')
    # Default uses ModelScope mirror for China accessibility
    ASR_MODELS: dict = {
        "tiny": "pengzhendong/faster-whisper-tiny",
        "base": "pengzhendong/faster-whisper-base",
        "small": "pengzhendong/faster-whisper-small",
        "medium": "pengzhendong/faster-whisper-medium",
        "large-v1": "pengzhendong/faster-whisper-large-v1",
        "large-v2": "pengzhendong/faster-whisper-large-v2",
        "large-v3": "pengzhendong/faster-whisper-large-v3",
        "large-v3-turbo": "pengzhendong/faster-whisper-large-v3-turbo",
    }

    # Downloader Settings
    DOWNLOADER_PROXY: str = "" # Set via env: DOWNLOADER_PROXY=http://127.0.0.1:7890
    DOWNLOADER_FORMATS: dict = {
        "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
        "4k": "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/mp4",
        "2k": "bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/mp4",
        "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/mp4",
        "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/mp4",
        "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/mp4",
        "audio": "bestaudio[ext=m4a]/bestaudio/best"
    }


    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def model_post_init(self, __context):
        """Auto-detect local binaries."""
        local_ffmpeg = self.BIN_DIR / "ffmpeg.exe"
        if local_ffmpeg.exists():
            self.FFMPEG_PATH = str(local_ffmpeg)
            
        local_ffprobe = self.BIN_DIR / "ffprobe.exe"
        if local_ffprobe.exists():
            self.FFPROBE_PATH = str(local_ffprobe)
            
        self.init_dirs()

    def init_dirs(self):
        """Ensure critical directories exist."""
        for path in [self.WORKSPACE_DIR, self.TEMP_DIR, self.MODEL_DIR, self.OUTPUT_DIR, self.USER_DATA_DIR, self.BIN_DIR, self.OCR_MODEL_DIR]:
            path.mkdir(parents=True, exist_ok=True)
        
        # Create subdirs in user_data
        (self.USER_DATA_DIR / "watermarks").mkdir(exist_ok=True)

settings = Settings()

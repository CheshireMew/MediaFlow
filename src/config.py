from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # App Info
    APP_NAME: str = "MediaFlow Core"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    
    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    TEMP_DIR: Path = BASE_DIR / "temp"
    MODEL_DIR: Path = BASE_DIR / "models"
    OUTPUT_DIR: Path = BASE_DIR / "output"
    USER_DATA_DIR: Path = BASE_DIR / "user_data"
    BIN_DIR: Path = BASE_DIR / "bin"
    
    # Executables
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    
    # Faster Whisper CLI
    FASTER_WHISPER_CLI_PATH: str = r"D:\Software\Video\Faster-Whisper-XXL\faster-whisper-xxl.exe"

    # ASR Settings
    ASR_MAX_WORKERS: int = 2
    ASR_MODEL_DIR: Path = BASE_DIR / "models" / "faster-whisper"
    
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

    # LLM Settings (Translator) - Must be set in .env file
    LLM_API_KEY: str = ""  # Required: Set VITE_LLM_API_KEY in .env
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-3.5-turbo"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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
        for path in [self.TEMP_DIR, self.MODEL_DIR, self.OUTPUT_DIR, self.USER_DATA_DIR, self.BIN_DIR]:
            path.mkdir(parents=True, exist_ok=True)
        
        # Create subdirs in user_data
        (self.USER_DATA_DIR / "watermarks").mkdir(exist_ok=True)

settings = Settings()

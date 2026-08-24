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

RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR"
RUNTIME_MAX_MANAGED_BYTES_ENV = "MEDIAFLOW_RUNTIME_MAX_MANAGED_BYTES"
RUNTIME_MIN_FREE_BYTES_ENV = "MEDIAFLOW_RUNTIME_MIN_FREE_BYTES"

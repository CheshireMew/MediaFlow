from pathlib import Path
from loguru import logger
import shutil
from .artifacts import sanitize_filename

class DownloadPostProcessor:
    def process_local_file(self, local_source: Path, dest_dir: Path, filename: str) -> Path:
        safe_name = sanitize_filename(filename) or "download"
        dest_path = dest_dir / f"{safe_name}.mp4"
        logger.info(f"Moving local file {local_source} to {dest_path}")
        shutil.move(str(local_source), str(dest_path))
        return dest_path

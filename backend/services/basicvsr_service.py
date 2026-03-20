import os
import subprocess
import logging
from pathlib import Path
from typing import Optional, Callable

from .model_asset_downloader import ensure_basicvsr_assets

class BasicVSRService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        # Ensure we point to the sidecar python environment
        self.python_env_path = Path("bin/python_env/python.exe").resolve()
        self.script_path = Path("src/services/basicvsr_worker.py").resolve()
        
    def is_available(self) -> bool:
        """Check if the sidecar environment is ready."""
        return self.python_env_path.exists()

    def upscale(
        self, 
        input_path: str, 
        output_path: str, 
        model: str = "basicvsr_plusplus_c64n7_8x1_600k_reds4",
        scale: int = 4,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> bool:
        """
        Run BasicVSR++ using the sidecar python environment.
        """
        if not self.is_available():
            self.logger.error("BasicVSR++ environment not found. Please run install_basicvsr.py")
            if progress_callback:
                progress_callback(0, "Error: BasicVSR++ env missing")
            return False

        if progress_callback:
            progress_callback(0, "Preparing BasicVSR++ models...")
        ensure_basicvsr_assets(
            (lambda p, msg: progress_callback(p * 10, msg)) if progress_callback else None
        )

        # Construct command to run the worker script in the sidecar env
        cmd = [
            str(self.python_env_path),
            str(self.script_path),
            "--input", input_path,
            "--output", output_path,
            "--model", model
        ]

        self.logger.info(f"Starting BasicVSR++ inference: {' '.join(cmd)}")
        if progress_callback:
            progress_callback(0, "Starting BasicVSR++ (this may take a while)...")

        try:
            # We use Popen to capture stdout for progress parsing
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )

            # Read stdout line by line
            for line in process.stdout:
                line = line.strip()
                if not line: continue
                
                # Check for progress info in stdout
                # Expected format from worker: "Progress: 45.0%"
                if "Progress:" in line and progress_callback:
                    try:
                        # Extract percentage
                        parts = line.split("Progress:")[1].strip().replace("%", "")
                        percent = float(parts)
                        # We map worker's 0-100 to task's 0-100 directly
                        progress_callback(percent, f"Enhancing... {percent:.1f}%")
                    except ValueError:
                        pass
                
                self.logger.debug(f"[BasicVSR] {line}")

            process.wait()
            
            if process.returncode != 0:
                error_msg = f"BasicVSR++ failed with return code {process.returncode}"
                self.logger.error(error_msg)
                if progress_callback:
                    progress_callback(0, f"Error: {error_msg}")
                raise RuntimeError(error_msg)
                
            # Merge Audio
            if progress_callback:
                progress_callback(95, "Merging Audio...")
                
            try:
                # We need ffmpeg
                # Assuming ffmpeg is in path or we can import settings
                # But importing src.config might be circular? No.
                from backend.config import settings
                ffmpeg_exe = settings.FFMPEG_PATH
                
                # Move video to temp
                temp_video = output_path + ".temp.mp4"
                if os.path.exists(output_path):
                    os.rename(output_path, temp_video)
                
                # Merge
                # ffmpeg -i temp_video -i input -c copy -map 0:v -map 1:a output
                merge_cmd = [
                    ffmpeg_exe, "-y",
                    "-i", temp_video,
                    "-i", input_path,
                    "-map", "0:v",
                    "-map", "1:a?",
                    "-c", "copy",
                    output_path
                ]
                
                subprocess.run(merge_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                # Clean temp
                if os.path.exists(temp_video):
                    os.remove(temp_video)
                    
            except Exception as e:
                self.logger.warning(f"Audio merge failed: {e}")
                # If merge fails, restore video
                if os.path.exists(temp_video) and not os.path.exists(output_path):
                    os.rename(temp_video, output_path)

            if progress_callback:
                progress_callback(100, "Enhancement Complete")
                
            return True

        except Exception as e:
            self.logger.exception(f"Error executing BasicVSR++: {e}")
            raise e

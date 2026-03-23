
import subprocess
import os
import re
import sys
from pathlib import Path
from loguru import logger
from typing import Optional, Callable

class RealESRGANService:
    def __init__(self):
        # Default binary location: tools/realesrgan-ncnn-vulkan.exe or bin/realesrgan-ncnn-vulkan.exe
        self.binary_path = self._find_binary()

    def _find_binary(self) -> Optional[str]:
        """Locate the realesrgan-ncnn-vulkan executable."""
        possible_paths = [
            Path("bin/realesrgan-ncnn-vulkan.exe"),
            Path("tools/realesrgan-ncnn-vulkan.exe"),
            Path("realesrgan-ncnn-vulkan.exe"),
            Path("bin/realesrgan-ncnn-vulkan"), # Linux/Mac
        ]
        
        for p in possible_paths:
            if p.exists() and p.is_file():
                return str(p.absolute())
        return None

    def is_available(self) -> bool:
        return self.binary_path is not None

    def upscale(
        self, 
        input_path: str, 
        output_path: str, 
        model: str = "realesrgan-x4plus", 
        scale: int = 4,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ):
        # Check for .pth model (User provided / PyTorch backend)
        pth_path = os.path.join("bin", "models", f"{model}.pth")
        if os.path.exists(pth_path):
            return self._run_pytorch_worker(input_path, output_path, pth_path, progress_callback)

        if str(model).startswith("basicvsr"):
            from .basicvsr_service import BasicVSRService
            service = BasicVSRService()
            if not service.is_available():
                raise FileNotFoundError("BasicVSR++ environment not found. Please run install_basicvsr.py")
            service.upscale(input_path, output_path, model, scale, progress_callback)
            return output_path

        if not self.binary_path:
            raise FileNotFoundError("Real-ESRGAN binary not found. Please install it in 'bin/' folder.")

        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
            
        # Import settings for ffmpeg path
        from backend.config import settings
        import shutil
        import tempfile
        
        ffmpeg_exe = settings.FFMPEG_PATH
        
        # 1. Prepare Paths
        # Create a temp directory for this task
        task_temp_dir = Path(tempfile.mkdtemp(prefix="realesrgan_task_"))
        frames_in = task_temp_dir / "frames_in"
        frames_out = task_temp_dir / "frames_out"
        frames_in.mkdir()
        frames_out.mkdir()
        
        try:
            # Check if input is image
            is_image = input_path.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
            
            if is_image:
                # Direct upscale for single image
                logger.info(f"Upscaling single image: {input_path}")
                if progress_callback: progress_callback(10.0, "Upscaling image...")
                
                # Determine model directory relative to binary
                binary_dir = Path(self.binary_path).parent
                model_dir = binary_dir / "models"

                cmd = [
                    self.binary_path,
                    "-i", input_path,
                    "-o", output_path,
                    "-n", model,
                    "-s", str(scale),
                    "-m", str(model_dir),
                    "-g", "0", # Force GPU 0
                    "-j", "4:4:4", # Load:Proc:Save threads
                    "-f", "jpg"
                ]
                
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                
                if progress_callback: progress_callback(100.0, "Complete")
                return output_path

            # 2. Extract Frames (Video Only)
            logger.info("Extracting frames...")
            if progress_callback: progress_callback(0.0, "Extracting frames...")
            
            # Use jpg for speed/compatibility (q:v 2 is high quality)
            extract_cmd = [
                ffmpeg_exe, "-y", 
                "-i", input_path, 
                "-q:v", "2", 
                str(frames_in / "frame_%08d.jpg")
            ]
            subprocess.run(extract_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            num_frames = len(list(frames_in.glob("*.jpg")))
            logger.info(f"Extracted {num_frames} frames.")

            # 3. Upscale Frames (Directory Mode)
            # realesrgan-ncnn-vulkan supports folder input
            logger.info("Upscaling frames...")
            if progress_callback: progress_callback(10.0, "Upscaling frames (this may take a while)...")
            
            # Determine model directory relative to binary
            binary_dir = Path(self.binary_path).parent
            model_dir = binary_dir / "models"

            cmd = [
                self.binary_path,
                "-i", str(frames_in),
                "-o", str(frames_out),
                "-n", model,
                "-s", str(scale),
                "-m", str(model_dir),
                "-g", "0", # Force GPU 0
                "-j", "4:4:4", # Load:Proc:Save threads
                "-f", "jpg"
            ]
            
            # Run RealESRGAN
            # CAUTION: Using PIPE without reading can cause deadlocks if buffer fills up.
            # We use file counting for progress, so we can redirect logs to a file or DEVNULL.
            log_file = task_temp_dir / "realesrgan.log"
            with open(log_file, "w", encoding="utf-8") as f_log:
                process = subprocess.Popen(
                    cmd,
                    stdout=f_log,
                    stderr=subprocess.STDOUT, # Merge stderr into stdout
                    text=True,
                    encoding="utf-8",
                    errors="replace"
                )
            
            # Monitor progress by file count (more reliable than parsing ncnn stderr)
            import time
            while process.poll() is None:
                # Count output files
                # Note: frames_out might be empty initially
                try:
                    # Using scandir for better performance if many files, or just glob
                    # glob is fine for typical video frame counts
                    done_count = len(list(frames_out.glob("*.jpg")))
                    
                    if progress_callback and num_frames > 0:
                        # Map 0-100% of upscale to 10-90% of total task
                        # We use 80% range for upscaling (10 -> 90)
                        progress = (done_count / num_frames) * 80.0
                        total_p = 10.0 + progress
                        # Clamp to 90%
                        total_p = min(90.0, total_p)
                        progress_callback(total_p, f"Upscaling... {done_count}/{num_frames}")
                except Exception:
                    pass
                
                time.sleep(0.5)

            # Process finished, check return code
            if process.returncode != 0:
                 log_content = ""
                 try:
                     log_content = log_file.read_text(encoding="utf-8", errors="replace")[-2000:]
                 except Exception:
                     pass
                 logger.error(f"Real-ESRGAN failed (code {process.returncode}). Log tail:\n{log_content}")
                 raise RuntimeError(f"Real-ESRGAN failed with code {process.returncode}")

            # 4. Mercury (Merge) Frames
            logger.info("Merging frames...")
            if progress_callback: progress_callback(90.0, "Merging video...")
            
            # Get source framerate
            # ffmpeg -i input.mp4 
            # We can just copy timestamp from input if we assume 1:1, but safer to force fps
            # Simple merge:
            # Detect FPS before building merge command
            detected_fps = "30"
            try:
                probe_cmd = [settings.FFPROBE_PATH, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=noprint_wrappers=1:nokey=1", input_path]
                fps_str = subprocess.check_output(probe_cmd, text=True, encoding="utf-8", errors="replace").strip()
                if fps_str:
                    detected_fps = fps_str
            except Exception:
                logger.warning("Could not detect FPS, defaulting to 30")

            merge_cmd = [
                ffmpeg_exe, "-y",
                "-framerate", detected_fps,
                "-i", str(frames_out / "frame_%08d.jpg"),
                "-i", input_path, # for audio
                "-map", "0:v", "-map", "1:a?",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                output_path
            ]

            subprocess.run(merge_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            if progress_callback: progress_callback(100.0, "Complete")
            logger.success(f"Upscaling complete: {output_path}")
            return output_path

        finally:
            # 5. Cleanup
            try:
                shutil.rmtree(task_temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp dir {task_temp_dir}: {e}")

    def _run_pytorch_worker(
        self, 
        input_path: str, 
        output_path: str, 
        model_path: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> str:
        """Run the PyTorch worker (sidecar env) for .pth models."""
        logger.info(f"Running PyTorch worker for {model_path}")
        
        PYTHON_EXE = os.path.join("bin", "python_env", "python.exe")
        WORKER_SCRIPT = os.path.join("src", "services", "realesrgan_pytorch_worker.py")
        
        if not os.path.exists(PYTHON_EXE):
             raise FileNotFoundError(f"Sidecar Python not found at {PYTHON_EXE}")

        cmd = [
            PYTHON_EXE, WORKER_SCRIPT,
            "--input", input_path,
            "--output", output_path,
            "--model_path", model_path,
            "--tile", "0" 
        ]
        
        if progress_callback:
            progress_callback(0, "Initializing PyTorch Inference...")
            
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            
            if line:
                line = line.strip()
                logger.debug(f"[Worker] {line}")
                
                # Parse progress
                if "Progress:" in line and "%" in line:
                    try:
                        # "Progress: 50.1%"
                        p_str = line.split("Progress:")[1].replace("%", "").strip()
                        p = float(p_str)
                        if progress_callback:
                            progress_callback(p, "Upscaling...")
                    except (ValueError, IndexError):
                        pass
                        
        if process.returncode != 0:
            raise RuntimeError(f"PyTorch worker failed with code {process.returncode}")
            
        # Merge Audio (The worker outputs silent video)
        logger.info("Merging audio...")
        if progress_callback: progress_callback(95, "Merging Audio...")
        
        try:
            from backend.config import settings
            ffmpeg_exe = settings.FFMPEG_PATH
            
            temp_video = output_path
            final_output = output_path + ".merged.mp4" # Temp name to avoid collision if we rename
            
            # If we want to overwrite output_path, we need to be careful
            # We can rename output_path to temp, then merge to output_path
            
            temp_silent = output_path + ".silent.mp4"
            if os.path.exists(temp_silent):
                os.remove(temp_silent)
                
            os.rename(output_path, temp_silent)
            
            merge_cmd = [
                ffmpeg_exe, "-y",
                "-i", temp_silent,
                "-i", input_path,
                "-map", "0:v",
                "-map", "1:a?",
                "-c:v", "copy",
                "-c:a", "copy",
                output_path
            ]
            
            subprocess.run(merge_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            if os.path.exists(temp_silent):
                os.remove(temp_silent)
                
        except Exception as e:
            logger.error(f"Audio merge failed: {e}")
            # If merge fails, at least restore the silent video
            if os.path.exists(temp_silent) and not os.path.exists(output_path):
                os.rename(temp_silent, output_path)
            
        return output_path

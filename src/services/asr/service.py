import os
import time
import shutil
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from src.config import settings
from src.models.schemas import SubtitleSegment, TranscribeResponse, TaskResult, FileRef
from src.utils.audio_processor import AudioProcessor
from src.utils.subtitle_manager import SubtitleManager
from src.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig

from .model_manager import ModelManager
from .core_strategies import CoreStrategies
from src.utils.peaks_generator import generate_multi_resolution_peaks
from .post_processor import PostProcessor

class ASRService:
    def __init__(self):
        """Initialized via Container."""
        self.executor = ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
        self.model_manager = ModelManager()
        self.adapter = FasterWhisperAdapter()
        self.core_strategies = CoreStrategies(self.executor)

    def transcribe(self, audio_path: str, model_name: str = "base", device: str = "cpu", language: str = None, task_id: str = None, initial_prompt: str = None, progress_callback=None, generate_peaks: bool = True) -> TaskResult:
        """
        Main entry point for transcription. Dispatches to specific strategies.
        """
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return TaskResult(success=False, error=f"File not found: {audio_path}")

        if not initial_prompt:
             initial_prompt = "Hello, Welcome. This is a subtitle for the video." if not language or language == "en" else "你好，欢迎。这是一个视频字幕。"

        # Calculate duration once for all paths
        try:
            duration = AudioProcessor.get_audio_duration(audio_path)
            logger.info(f"Audio Duration: {duration:.2f}s")
        except Exception as e:
            logger.error(f"Failed to get duration: {e}")
            duration = 0.0

        # Check for CLI tool
        use_cli = False
        if hasattr(settings, 'FASTER_WHISPER_CLI_PATH') and os.path.exists(settings.FASTER_WHISPER_CLI_PATH):
            use_cli = True
            logger.info("Faster-Whisper CLI found. Using CLI for best segmentation results.")
        
        final_segments = []
        
        if use_cli:
            output_dir = settings.TEMP_DIR / f"cli_out_{Path(audio_path).stem}_{int(time.time())}"
            try:
                # 1. Ensure model is available locally
                # ModelManager returns path to model dir (or model name if fallback)
                local_model_path_str = self.model_manager.ensure_model_downloaded(model_name, progress_callback)
                
                # 2. Configure Adapter
                config = FasterWhisperConfig(
                    audio_path=Path(audio_path),
                    output_dir=output_dir,
                    model_name=model_name,
                    # Pass the root model directory so CLI can find "faster-whisper-{model}" inside it
                    # OR pass the specific path if it's "large-v3" inside "faster-whisper-large-v3"
                    # FasterWhisperAdapter logic: cmd.extend(["--model_dir", str(config.model_dir)])
                    # The CLI --model_dir usually expects the directory containing the model folder, OR the model folder itself?
                    # If I pass the specific folder, then --model arg should be "."? 
                    # Standard Faster-Whisper CLI usage: --model large-v3 --model_dir /path/to/models
                    # It looks for /path/to/models/large-v3 (or faster-whisper-large-v3 depending on impl).
                    # Our ModelManager downloads to settings.ASR_MODEL_DIR / f"faster-whisper-{model_name}"
                    # So we should pass settings.ASR_MODEL_DIR as model_dir.
                    model_dir=settings.ASR_MODEL_DIR,
                    language=language,
                    initial_prompt=initial_prompt,
                    # Calculate max_line_width based on language
                    max_line_width=30 if language in ["zh", "ja", "ko", "zh-CN"] else 50,
                    device=device
                )

                final_segments = self.adapter.execute(config, progress_callback)
                
            except Exception as e:
                logger.error(f"CLI Transcription failed: {e}. Falling back to internal engine.")
                use_cli = False # Fallback
            finally:
                # Cleanup temp output
                if output_dir.exists():
                     try:
                         shutil.rmtree(output_dir, ignore_errors=True)
                     except:
                         pass

        if not use_cli:
            # 1. Load Model
            model = self.model_manager.load_model(model_name, device, progress_callback)
            
            # 2. Analyze Audio
            # Duration already calculated at start
            logger.info(f"Audio Duration: {duration:.2f}s")
            
            # 3. Strategy Decision
            if duration > 900: 
                all_segments = self.core_strategies.transcribe_smart_split(
                    audio_path, duration, model, language, initial_prompt, progress_callback
                )
            else:
                all_segments = self.core_strategies.transcribe_direct(
                    audio_path, duration, model, language, initial_prompt, progress_callback
                )
            
            # 4. Final Processing
            if progress_callback: progress_callback(95, "Finalizing segments...")
            final_segments, _ = PostProcessor.merge_segments(all_segments)

        # Apply Smart Merge (Fix V2 over-segmentation)
        logger.info("Applying smart segment merging...")
        if final_segments:
            final_segments = SubtitleManager.merge_segments(final_segments)
        else:
            final_segments = []

        # Generate full text
        full_text = "\n".join([s.text for s in final_segments])
            
        logger.success(f"Transcription complete. Total segments: {len(final_segments)}")
        if progress_callback: progress_callback(100, "Completed")
        
        # 5. Save SRT file
        srt_path = SubtitleManager.save_srt(final_segments, audio_path)
        logger.success(f"SRT file saved to: {srt_path}")

        if generate_peaks:
            # 6. Pre-generate waveform peaks for the editor (non-blocking best-effort)
            try:
                hi_path, lo_path = generate_multi_resolution_peaks(audio_path)
                if hi_path:
                    logger.success(f"Waveform peaks generated: {hi_path}")
            except Exception as e:
                logger.warning(f"Peaks generation failed (non-critical): {e}")
        
        files = [
            FileRef(type="subtitle", path=str(srt_path), label="transcription")
        ]

        return TaskResult(
            success=True,
            files=files,
            meta={
                "task_id": task_id or "sync_task",
                "language": language or "auto",
                "duration": duration,
                "segments": [s.model_dump() for s in final_segments],
                "text": full_text
            }
        )

    def transcribe_segment(self, audio_path: str, start: float, end: float, model_name: str = "base", device: str = "cpu", language: str = None) -> TaskResult:
        """
        Transcribe a specific segment of the audio file.
        This is a synchronous blocking call designed for short segments (<60s).
        """
        import uuid
        temp_id = str(uuid.uuid4())[:8]
        segment_filename = f"segment_{temp_id}.mp3"
        segment_path = settings.TEMP_DIR / segment_filename
        
        try:
            # 1. Extract Segment
            AudioProcessor.extract_segment(audio_path, start, end, str(segment_path))
            
            # 2. Transcribe (Recursive call but with short audio)
            # We force internal engine for speed on short segments? 
            # Actually, standard transcribe logic is fine, it handles short files via direct strategy.
            result = self.transcribe(
                audio_path=str(segment_path),
                model_name=model_name,
                device=device,
                language=language,
                task_id=f"seg_{temp_id}",
                generate_peaks=False  # Disable redundant peak generation
            )
            
            # 3. Adjust timestamps relative to original audio
            if result.success and result.meta and "segments" in result.meta:
                for seg in result.meta["segments"]:
                    seg["start"] += start
                    seg["end"] += start
            
            return result

        except Exception as e:
            logger.error(f"Segment transcription failed: {e}")
            return TaskResult(success=False, error=str(e))
        finally:
            # Cleanup
            if segment_path.exists():
                try:
                    os.remove(segment_path)
                except:
                    pass

import os
import time
import shutil
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from backend.config import settings
from backend.models.schemas import SubtitleSegment, TranscribeResponse, TaskResult, FileRef
from backend.utils.audio_processor import AudioProcessor
from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils.segment_refiner import SegmentRefiner
from backend.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig
from backend.core.task_control import TaskControlRequested
from backend.services.media_refs import create_media_ref

from .model_manager import ModelManager
from .core_strategies import CoreStrategies
from backend.utils.peaks_generator import start_peaks_warmup

class ASRService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
        self.model_manager = ModelManager()
        self.adapter = FasterWhisperAdapter()
        self.core_strategies = CoreStrategies(self.executor)

    def transcribe(self, audio_path: str, model_name: str = "base", device: str = "cpu", language: str = None, task_id: str = None, initial_prompt: str = None, progress_callback=None, generate_peaks: bool = True, engine: str = "builtin") -> TaskResult:
        """
        Main entry point for transcription. Dispatches to specific strategies.
        """
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return TaskResult(success=False, error=f"File not found: {audio_path}")

        # Calculate duration once for all paths
        try:
            duration = AudioProcessor.get_audio_duration(audio_path)
            logger.info(f"Audio Duration: {duration:.2f}s")
        except Exception as e:
            logger.error(f"Failed to get duration: {e}")
            duration = 0.0

        # Engine selection is request-driven. Do not silently switch engines.
        cli_available = (
            hasattr(settings, "FASTER_WHISPER_CLI_PATH")
            and os.path.exists(settings.FASTER_WHISPER_CLI_PATH)
        )
        use_cli = engine == "cli"
        if use_cli and not cli_available:
            return TaskResult(success=False, error="CLI transcription engine is unavailable")
        if use_cli:
            logger.info("Faster-Whisper CLI enabled. Using CLI transcription path.")

        if generate_peaks:
            try:
                start_peaks_warmup(audio_path)
            except Exception as e:
                logger.warning(f"Peaks warmup failed to start (non-critical): {e}")
        
        final_segments = []
        
        if use_cli:
            output_dir = settings.WORKSPACE_DIR / f"cli_out_{Path(audio_path).stem}_{int(time.time())}"
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
                    device=device,
                )

                final_segments = self.adapter.execute(config, progress_callback)
                
            except TaskControlRequested:
                raise
            except Exception as e:
                logger.error(f"CLI Transcription failed: {e}.")
                return TaskResult(success=False, error=f"CLI transcription failed: {e}")
            finally:
                # Cleanup temp output
                if output_dir.exists():
                     try:
                         shutil.rmtree(output_dir, ignore_errors=True)
                     except OSError:
                         pass

        if not use_cli:
            # 1. Load Model
            model = self.model_manager.load_model(model_name, device, progress_callback)

            # 2. Analyze Audio
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

            # 4. Sort and assign to final_segments
            if progress_callback: progress_callback(95, "Finalizing segments...")
            all_segments.sort(key=lambda x: x.start)
            final_segments = all_segments

        # Unified post-processing for both CLI and Python API paths
        logger.info("Applying smart segment merging...")
        if final_segments:
            final_segments = SegmentRefiner.normalize_segments(final_segments)
        else:
            final_segments = []

        # Generate full text
        full_text = "\n".join([s.text for s in final_segments])
            
        logger.success(f"Transcription complete. Total segments: {len(final_segments)}")
        if progress_callback: progress_callback(100, "Completed")
        
        # 5. Save SRT file
        srt_path = SubtitleWriter.save_srt(final_segments, audio_path)
        logger.success(f"SRT file saved to: {srt_path}")

        files = [
            FileRef(type="subtitle", path=str(srt_path), label="transcription")
        ]
        subtitle_ref = create_media_ref(
            str(srt_path),
            "application/x-subrip",
            role="output",
        )

        return TaskResult(
            success=True,
            files=files,
            meta={
                "task_id": task_id or "sync_task",
                "language": language or "auto",
                "duration": duration,
                "segments": [s.model_dump() for s in final_segments],
                "text": full_text,
                "srt_path": str(srt_path),
                "subtitle_ref": subtitle_ref,
                "output_ref": subtitle_ref,
            }
        )

    def transcribe_segment(
        self,
        audio_path: str,
        start: float,
        end: float,
        model_name: str = "base",
        device: str = "cpu",
        language: str = None,
        engine: str = "builtin",
        task_id: str = None,
        progress_callback=None,
    ) -> TaskResult:
        """
        Transcribe a specific segment of the audio file.
        This is a synchronous blocking call designed for short segments (<60s).
        """
        import uuid
        temp_id = str(uuid.uuid4())[:8]
        segment_filename = f"segment_{temp_id}.wav"
        segment_path = settings.WORKSPACE_DIR / segment_filename
        
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
                engine=engine,
                task_id=task_id or f"seg_{temp_id}",
                progress_callback=progress_callback,
                generate_peaks=False,  # Disable redundant peak generation
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
                except OSError:
                    pass

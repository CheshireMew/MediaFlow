import os
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from src.config import settings
from src.models.schemas import SubtitleSegment, TranscribeResponse
from src.utils.audio_processor import AudioProcessor
from src.utils.subtitle_manager import SubtitleManager

from .model_manager import ModelManager
from .cli_executor import CLIExecutor
from .core_strategies import CoreStrategies
from .post_processor import PostProcessor

class ASRService:
    _instance = None

    def __new__(cls):
        """Singleton pattern ensuring only one service instance exists."""
        if cls._instance is None:
            cls._instance = super(ASRService, cls).__new__(cls)
            cls._instance.executor = ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
            cls._instance.model_manager = ModelManager()
            cls._instance.cli_executor = CLIExecutor(cls._instance.model_manager)
            cls._instance.core_strategies = CoreStrategies(cls._instance.executor)
        return cls._instance

    def transcribe(self, audio_path: str, model_name: str = "base", device: str = "cpu", language: str = None, task_id: str = None, initial_prompt: str = None, progress_callback=None) -> TranscribeResponse:
        """
        Main entry point for transcription. Dispatches to specific strategies.
        """
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            raise FileNotFoundError(f"File not found: {audio_path}")

        if not initial_prompt:
             initial_prompt = "Hello, Welcome. This is a subtitle for the video." if not language or language == "en" else "你好，欢迎。这是一个视频字幕。"

        # Check for CLI tool
        use_cli = False
        if hasattr(settings, 'FASTER_WHISPER_CLI_PATH') and os.path.exists(settings.FASTER_WHISPER_CLI_PATH):
            use_cli = True
            logger.info("Faster-Whisper CLI found. Using CLI for best segmentation results.")
        
        final_segments = []
        
        if use_cli:
            try:
                final_segments = self.cli_executor.transcribe(
                    audio_path, model_name, language, initial_prompt, progress_callback
                )
            except Exception as e:
                logger.error(f"CLI Transcription failed: {e}. Falling back to internal engine.")
                use_cli = False # Fallback
                
        if not use_cli:
            # 1. Load Model
            model = self.model_manager.load_model(model_name, device, progress_callback)
            
            # 2. Analyze Audio
            duration = AudioProcessor.get_audio_duration(audio_path)
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
        
        return TranscribeResponse(
            task_id=task_id or "sync_task",
            segments=final_segments,
            text=full_text,
            language=language or "auto",
            srt_path=srt_path
        )

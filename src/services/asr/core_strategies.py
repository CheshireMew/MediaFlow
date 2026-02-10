from typing import List, Any
from pathlib import Path
import shutil
from loguru import logger
from src.config import settings
from src.models.schemas import SubtitleSegment
from src.utils.audio_processor import AudioProcessor
from src.utils.subtitle_manager import SubtitleManager
from concurrent.futures import ThreadPoolExecutor, as_completed

class CoreStrategies:
    def __init__(self, executor: ThreadPoolExecutor):
        self.executor = executor

    def transcribe_direct(self, audio_path: str, duration: float, model: Any, language: str, initial_prompt: str, progress_callback) -> List[SubtitleSegment]:
        """Handle short audio files directly."""
        logger.info(f"Short audio ({duration:.2f}s). Direct transcription.")
        if progress_callback: progress_callback(20, "Starting transcription...")
        
        segments_gen, info = model.transcribe(
            audio_path, 
            beam_size=5, 
            language=language,
            vad_filter=True,
            initial_prompt=initial_prompt,
            word_timestamps=True,
            condition_on_previous_text=False
        )
        
        segments_list = list(segments_gen)
        return SubtitleManager.refine_segments(segments_list, max_chars=50)

    def transcribe_smart_split(self, audio_path: str, duration: float, model: Any, language: str, initial_prompt: str, progress_callback) -> List[SubtitleSegment]:
        """Handle long audio files by splitting them based on silence."""
        logger.info("Long audio detected. Using VAD Smart Splitting strategy.")
        if progress_callback: progress_callback(10, "Splitting audio...")

        silence_intervals = AudioProcessor.detect_silence(audio_path)
        split_points = AudioProcessor.calculate_split_points(duration, silence_intervals)
        logger.info(f"Calculated {len(split_points)} split points: {[f'{p:.1f}s' for p in split_points]}")
        
        chunk_dir = settings.TEMP_DIR / f"chunks_{Path(audio_path).stem}"
        chunk_dir.mkdir(parents=True, exist_ok=True)
        
        chunks = AudioProcessor.split_audio_physically(audio_path, split_points, chunk_dir)
        logger.info(f"Split into {len(chunks)} physical chunks.")
        
        if progress_callback: progress_callback(20, f"Split into {len(chunks)} chunks. Starting transcription...")

        all_segments = []
        total_chunks = len(chunks)
        completed_chunks = 0
        
        try:
            futures = {}
            for chunk in chunks:
                future = self.executor.submit(
                    self._process_chunk, 
                    chunk, model, language, initial_prompt
                )
                futures[future] = chunk
            
            for future in as_completed(futures):
                res = future.result()
                all_segments.extend(res)
                completed_chunks += 1
                
                if progress_callback:
                    progress = 20 + int((completed_chunks / total_chunks) * 70)
                    progress_callback(progress, f"Transcribed {completed_chunks}/{total_chunks} chunks")

        except Exception as e:
            logger.error(f"Chunk transcription failed: {e}")
            raise e
        finally:
            if chunk_dir.exists():
                shutil.rmtree(chunk_dir, ignore_errors=True)
        
        return all_segments

    def _process_chunk(self, chunk_info, model: Any, language: str, initial_prompt: str) -> List[SubtitleSegment]:
        """Process a single audio chunk."""
        c_path, c_offset = chunk_info
        logger.info(f"Transcribing chunk starting at {c_offset:.1f}s...")
        segs, _ = model.transcribe(
            c_path, 
            beam_size=5, 
            language=language, 
            vad_filter=True,
            initial_prompt=initial_prompt,
            word_timestamps=True 
        )
        
        # Convert generator to list
        segs_list = list(segs)
        
        # Refine relative to chunk
        refined_local = SubtitleManager.refine_segments(segs_list, max_chars=50)
        
        # Apply Offset
        chunk_segments = []
        for s in refined_local:
            s.start += c_offset
            s.end += c_offset
            chunk_segments.append(s)
            
        return chunk_segments

from typing import List, Any
import shutil
import tempfile
from pathlib import Path
from loguru import logger
from backend.config import settings
from backend.models.schemas import SubtitleSegment
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner
from concurrent.futures import ThreadPoolExecutor, as_completed

class CoreStrategies:
    def __init__(self, executor: ThreadPoolExecutor):
        self.executor = executor

    @staticmethod
    def _create_chunk_dir() -> Path:
        base_dir = settings.TEMP_DIR / "asr-chunks"
        base_dir.mkdir(parents=True, exist_ok=True)
        return Path(tempfile.mkdtemp(prefix="chunks-", dir=base_dir))

    def transcribe_direct(
        self,
        audio_path: str,
        duration: float,
        model: Any,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
        progress_callback,
    ) -> List[SubtitleSegment]:
        """Handle short audio files directly."""
        logger.info(f"Short audio ({duration:.2f}s). Direct transcription.")
        if progress_callback:
            progress_callback(20, "transcription_starting", {})
        
        segments_gen, info = model.transcribe(
            audio_path, 
            beam_size=5, 
            language=language,
            vad_filter=vad_filter,
            initial_prompt=initial_prompt,
            word_timestamps=True,
            condition_on_previous_text=False
        )
        
        segments_list = list(segments_gen)
        return SegmentRefiner.refine_segments(segments_list)

    def transcribe_smart_split(
        self,
        audio_path: str,
        duration: float,
        model: Any,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
        progress_callback,
    ) -> List[SubtitleSegment]:
        """Handle long audio files by splitting them based on silence."""
        logger.info("Long audio detected. Using VAD Smart Splitting strategy.")
        if progress_callback:
            progress_callback(10, "asr_audio_splitting", {})

        silence_intervals = AudioProcessor.detect_silence(audio_path)
        split_points = AudioProcessor.calculate_split_points(duration, silence_intervals)
        logger.info(f"Calculated {len(split_points)} split points: {[f'{p:.1f}s' for p in split_points]}")
        
        chunk_dir = self._create_chunk_dir()
        chunk_dir.mkdir(parents=True, exist_ok=True)
        
        chunks = AudioProcessor.split_audio_physically(audio_path, split_points, chunk_dir)
        logger.info(f"Split into {len(chunks)} physical chunks.")
        
        if progress_callback:
            progress_callback(
                20,
                "asr_chunks_progress",
                {"completed": 0, "total": len(chunks)},
            )

        all_segments = []
        total_chunks = len(chunks)
        completed_chunks = 0
        
        try:
            futures = {}
            for chunk in chunks:
                future = self.executor.submit(
                    self._process_chunk, 
                    chunk, model, language, initial_prompt, vad_filter
                )
                futures[future] = chunk
            
            for future in as_completed(futures):
                res = future.result()
                all_segments.extend(res)
                completed_chunks += 1
                
                if progress_callback:
                    progress = 20 + int((completed_chunks / total_chunks) * 70)
                    progress_callback(
                        progress,
                        "asr_chunks_progress",
                        {"completed": completed_chunks, "total": total_chunks},
                    )

        except Exception as e:
            logger.error(f"Chunk transcription failed: {e}")
            raise e
        finally:
            if chunk_dir.exists():
                shutil.rmtree(chunk_dir, ignore_errors=True)
        
        return all_segments

    def _process_chunk(
        self,
        chunk_info,
        model: Any,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
    ) -> List[SubtitleSegment]:
        """Process a single audio chunk."""
        c_path, c_offset = chunk_info
        logger.info(f"Transcribing chunk starting at {c_offset:.1f}s...")
        segs, _ = model.transcribe(
            c_path, 
            beam_size=5, 
            language=language, 
            vad_filter=vad_filter,
            initial_prompt=initial_prompt,
            word_timestamps=True 
        )
        
        # Convert generator to list
        segs_list = list(segs)
        
        # Refine relative to chunk
        refined_local = SegmentRefiner.refine_segments(segs_list)
        
        # Apply Offset
        chunk_segments = []
        for s in refined_local:
            s.start += c_offset
            s.end += c_offset
            chunk_segments.append(s)
            
        return chunk_segments

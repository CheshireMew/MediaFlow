import os
import shutil
import asyncio
from pathlib import Path
from typing import List, Optional, TYPE_CHECKING
from concurrent.futures import ThreadPoolExecutor

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

from loguru import logger

from src.config import settings
from src.models.schemas import SubtitleSegment, TranscribeResponse
from src.utils.audio_processor import AudioProcessor
from src.utils.subtitle_manager import SubtitleManager

class ASRService:
    _instance = None
    _model_instance = None
    _current_model_name = None

    def __new__(cls):
        """Singleton pattern ensuring only one service instance exists."""
        if cls._instance is None:
            cls._instance = super(ASRService, cls).__new__(cls)
            cls._instance.executor = ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
        return cls._instance

    def _load_model(self, model_name: str, device: str, progress_callback=None):
        """
        Load or reload the Whisper model securely from the local models directory.
        """
        if self._model_instance and self._current_model_name == model_name:
            return self._model_instance
            
        logger.info(f"Loading Whisper Model: {model_name} on {device}...")
        if progress_callback: progress_callback(0, f"Downloading model {model_name} (may take a while)...")
        
        # Lazy import to speed up app startup
        from faster_whisper import WhisperModel
        
        try:
            compute_type = "float16" if device == "cuda" else "int8"
            settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
            
            model_map = {
                "tiny": "pengzhendong/faster-whisper-tiny",
                "base": "pengzhendong/faster-whisper-base",
                "small": "pengzhendong/faster-whisper-small",
                "medium": "pengzhendong/faster-whisper-medium",
                "large-v1": "pengzhendong/faster-whisper-large-v1",
                "large-v2": "pengzhendong/faster-whisper-large-v2",
                "large-v3": "pengzhendong/faster-whisper-large-v3",
                "large-v3-turbo": "pengzhendong/faster-whisper-large-v3-turbo",
            }
            
            model_repo_id = model_map.get(model_name, model_name)
            
            # Download Logic
            try:
                from modelscope.hub.snapshot_download import snapshot_download
                logger.info(f"Attempting download from ModelScope: {model_repo_id}")
                
                target_dir = settings.MODEL_DIR / "faster-whisper" / model_name
                
                local_model_path = snapshot_download(
                    model_repo_id, 
                    local_dir=str(target_dir) 
                )
                logger.success(f"Model downloaded to: {local_model_path}")
                if progress_callback: progress_callback(5, "Model downloaded. Loading into memory...")
                
            except ImportError:
                logger.warning("ModelScope not installed, falling back to default (HuggingFace)...")
                if progress_callback: progress_callback(2, "ModelScope missing. Downloading from HuggingFace...")
                local_model_path = model_name 
            except Exception as e:
                logger.error(f"ModelScope download failed: {e}. Falling back to default...")
                if progress_callback: progress_callback(2, f"Download failed, retrying... ({str(e)[:20]})")
                local_model_path = model_name
            
            # Load model
            if progress_callback: progress_callback(8, f"Initializing {model_name} on {device}...")
            self._model_instance = WhisperModel(
                local_model_path,
                device=device,
                compute_type=compute_type,
                download_root=str(settings.MODEL_DIR) if local_model_path == model_name else None
            )
            self._current_model_name = model_name
            logger.success(f"Model {model_name} loaded successfully.")
            if progress_callback: progress_callback(10, "Model loaded successfully.")
            return self._model_instance
            
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            raise RuntimeError(f"Model loading failed: {e}")

    def transcribe(self, audio_path: str, model_name: str = "base", device: str = "cpu", language: str = None, task_id: str = None, initial_prompt: str = None, progress_callback=None) -> TranscribeResponse:
        """
        Main entry point for transcription. Dispatches to specific strategies.
        """
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            raise FileNotFoundError(f"File not found: {audio_path}")

        if not initial_prompt:
             initial_prompt = "Hello, Welcome. This is a subtitle for the video." if not language or language == "en" else "你好，欢迎。这是一个视频字幕。"

        # 1. Load Model
        model = self._load_model(model_name, device, progress_callback)
        
        # 2. Analyze Audio
        duration = AudioProcessor.get_audio_duration(audio_path)
        logger.info(f"Audio Duration: {duration:.2f}s")
        
        # 3. Strategy Decision
        if duration > 900: 
            all_segments = self._transcribe_smart_split(
                audio_path, duration, model, language, initial_prompt, progress_callback
            )
        else:
            all_segments = self._transcribe_direct(
                audio_path, duration, model, language, initial_prompt, progress_callback
            )

        # 4. Final Processing
        if progress_callback: progress_callback(95, "Finalizing segments...")
        
        final_segments, full_text = self._merge_segments(all_segments)
            
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

    def _transcribe_direct(self, audio_path: str, duration: float, model: "WhisperModel", language: str, initial_prompt: str, progress_callback) -> List[SubtitleSegment]:
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

    def _transcribe_smart_split(self, audio_path: str, duration: float, model: "WhisperModel", language: str, initial_prompt: str, progress_callback) -> List[SubtitleSegment]:
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
            # Create a localized function for pickle compatibility not required here since threads share memory
            # But direct method reference is cleaner.
            futures = {}
            for chunk in chunks:
                # We submit the _process_chunk method
                future = self.executor.submit(
                    self._process_chunk, 
                    chunk, model, language, initial_prompt
                )
                futures[future] = chunk

            from concurrent.futures import as_completed
            
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

    def _process_chunk(self, chunk_info, model: "WhisperModel", language: str, initial_prompt: str) -> List[SubtitleSegment]:
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

    def _merge_segments(self, all_segments: List[SubtitleSegment]):
        """Merge and sort segments from multiple chunks."""
        final_segments_list = []
        if all_segments:
             all_segments.sort(key=lambda x: x.start)
             final_segments_list.append(all_segments[0])
             for i in range(1, len(all_segments)):
                  prev = final_segments_list[-1]
                  curr = all_segments[i]
                  
                  is_single_word = " " not in curr.text.strip()
                  is_close = (curr.start - prev.end) < 0.5
                  
                  if is_single_word and is_close and (len(prev.text) + len(curr.text) < 60):
                       prev.text += " " + curr.text
                       prev.end = curr.end
                  else:
                       final_segments_list.append(curr)
        
        # Re-index
        final_segments = []
        full_text_list = []
        for i, seg in enumerate(final_segments_list):
            seg.id = str(i + 1)
            final_segments.append(seg)
            full_text_list.append(seg.text)
            
        return final_segments, "\n".join(full_text_list)



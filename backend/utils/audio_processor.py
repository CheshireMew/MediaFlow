import re
import subprocess
from pathlib import Path
from typing import List, Tuple
from loguru import logger
from backend.config import settings

class AudioProcessor:
    @staticmethod
    def get_audio_duration(audio_path: str) -> float:
        """Get audio duration using ffprobe."""
        try:
            if not Path(audio_path).exists():
                raise FileNotFoundError(f"Audio file not found: {audio_path}")

            cmd = [
                settings.FFPROBE_PATH, 
                "-v", "error", 
                "-show_entries", "format=duration", 
                "-of", "default=noprint_wrappers=1:nokey=1", 
                audio_path
            ]
            # Security: shell=False is default but explicit is better.
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, shell=False)
            return float(result.stdout.strip())
        except Exception as e:
            logger.error(f"Failed to get duration: {e}")
            return 0.0

    @staticmethod
    def detect_silence(audio_path: str, silence_thresh: str = "-30dB", min_silence_dur: float = 0.5) -> List[Tuple[float, float]]:
        """
        Detect silence intervals using ffmpeg silencedetect filter.
        Returns a list of (start, end) tuples for silence.
        """
        logger.info("Detecting silence intervals...")
        if not Path(audio_path).exists():
             logger.error(f"Audio file not found: {audio_path}")
             return []

        cmd = [
            settings.FFMPEG_PATH,
            "-i", audio_path,
            "-af", f"silencedetect=noise={silence_thresh}:d={min_silence_dur}",
            "-f", "null",
            "-"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", shell=False)
            # ffmpeg writes silencedetect output to stderr
            output = result.stderr
            
            silence_starts = []
            silence_ends = []
            
            # Parse output
            for line in output.split('\n'):
                if "silence_start" in line:
                    match = re.search(r"silence_start: (\d+(\.\d+)?)", line)
                    if match:
                        silence_starts.append(float(match.group(1)))
                elif "silence_end" in line:
                    match = re.search(r"silence_end: (\d+(\.\d+)?)", line)
                    if match:
                        silence_ends.append(float(match.group(1)))
            
            # Combine into intervals
            intervals = []
            for s, e in zip(silence_starts, silence_ends):
                intervals.append((s, e))
                
            logger.debug(f"Detected {len(intervals)} silence intervals.")
            return intervals
            
        except Exception as e:
            logger.warning(f"Silence detection failed: {e}")
            return []

    @staticmethod
    def calculate_split_points(total_duration: float, silence_intervals: List[Tuple[float, float]], target_chunk_duration: float = 600) -> List[float]:
        """
        Calculate safe split points based on silence intervals.
        Target chunk duration default: 600s (10 minutes).
        """
        split_points = []
        current_time = 0.0
        
        while current_time + target_chunk_duration < total_duration:
            target_time = current_time + target_chunk_duration
            
            # Find closest silence interval to target_time
            best_split_point = None
            
            # Search window: target_time +/- 60 seconds (1 minute)
            search_start = max(current_time + 60, target_time - 60) 
            search_end = min(total_duration - 10, target_time + 60)
            
            valid_silences = [
                (s, e) for s, e in silence_intervals 
                if s >= search_start and s <= search_end
            ]
            
            if valid_silences:
                # Pick the middle of the longest silence near target
                closest_silence = min(valid_silences, key=lambda x: abs(x[0] - target_time))
                # Split in the middle of silence
                best_split_point = (closest_silence[0] + closest_silence[1]) / 2
            else:
                # Fallback: Hard split if no silence found
                logger.warning(f"No silence found near {target_time}s. Hard splitting.")
                best_split_point = target_time
            
            split_points.append(best_split_point)
            current_time = best_split_point
            
        return split_points

    @staticmethod
    def split_audio_physically(audio_path: str, split_points: List[float], output_dir: Path) -> List[Tuple[str, float]]:
        """
        Split audio into precisely trimmed PCM WAV chunks.
        Using mp3 here introduces encoder delay/padding that can accumulate
        drift when chunk timestamps are stitched back onto the original media.
        Returns list of (chunk_path, start_offset_seconds).
        """
        chunks = []
        current_start = 0.0
        
        # Add end of file as final point
        all_points = split_points + [None] 
        
        base_name = Path(audio_path).stem
        
        for idx, end_point in enumerate(all_points):
            chunk_filename = f"{base_name}_part{idx:03d}.wav"
            chunk_path = output_dir / chunk_filename

            trim_filter = f"atrim=start={current_start:.3f}"
            if end_point is not None:
                trim_filter += f":end={end_point:.3f}"
            trim_filter += ",asetpts=PTS-STARTPTS"

            cmd = [
                settings.FFMPEG_PATH, "-y",
                "-i", audio_path,
                "-vn",
                "-af", trim_filter,
                "-ac", "1",
                "-ar", "16000",
                "-c:a", "pcm_s16le",
                str(chunk_path),
            ]
            
            try:
                # Validate input path before processing each chunk (though verified at start)
                if not Path(audio_path).exists():
                    raise FileNotFoundError(f"Source file lost: {audio_path}")

                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, shell=False)
                chunks.append((str(chunk_path), current_start))
                current_start = end_point if end_point is not None else current_start
            except Exception as e:
                logger.error(f"Failed to create chunk {idx}: {e}")
                
        return chunks

    @staticmethod
    def extract_segment(audio_path: str, start: float, end: float, output_path: str) -> str:
        """
        Extract a specific segment from audio file.
        Returns the path to the extracted file.
        """
        if not Path(audio_path).exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        if end <= start:
            raise ValueError("End time must be greater than start time")

        output_path_obj = Path(output_path)
        if output_path_obj.suffix.lower() != ".wav":
            output_path_obj = output_path_obj.with_suffix(".wav")

        trim_filter = f"atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS"
        cmd = [
            settings.FFMPEG_PATH, "-y",
            "-i", audio_path,
            "-vn",
            "-af", trim_filter,
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            str(output_path_obj)
        ]

        logger.info(f"Extracting segment: {start:.2f}-{end:.2f} to {output_path_obj}")
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, shell=False)
        return str(output_path_obj)

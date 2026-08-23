import json
import re
import statistics
import subprocess
from pathlib import Path
from typing import List, Tuple

from loguru import logger

from backend.config import settings


class AudioProcessor:
    STRONG_ANTIPHASE_MEDIAN_THRESHOLD = -0.75
    STRONG_ANTIPHASE_FRAME_RATIO = 0.60
    _SILENCE_EVENT_PATTERN = re.compile(
        r"silence_(?P<event>start|end):\s*(?P<time>-?\d+(?:\.\d+)?)"
    )

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
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True, shell=False)
            return float(result.stdout.strip())
        except Exception as e:
            logger.error(f"Failed to get duration: {e}")
            return 0.0

    @staticmethod
    def parse_silence_intervals(
        ffmpeg_output: str,
        *,
        media_duration: float | None = None,
    ) -> List[Tuple[float, float]]:
        """Parse ordered silencedetect events into complete silence intervals."""
        intervals: List[Tuple[float, float]] = []
        current_start: float | None = None
        for match in AudioProcessor._SILENCE_EVENT_PATTERN.finditer(ffmpeg_output):
            event = match.group("event")
            timestamp = max(0.0, float(match.group("time")))
            if event == "start":
                current_start = timestamp
                continue
            if current_start is None:
                continue
            intervals.append((current_start, max(current_start, timestamp)))
            current_start = None

        if (
            current_start is not None
            and media_duration is not None
            and media_duration >= current_start
        ):
            intervals.append((current_start, media_duration))
        return intervals

    @staticmethod
    def _run_silence_detection(
        audio_path: str,
        *,
        silence_thresh: str,
        min_silence_dur: float,
    ) -> str:
        cmd = [
            settings.FFMPEG_PATH,
            "-hide_banner",
            "-v",
            "info",
            "-nostats",
            "-i",
            audio_path,
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            f"silencedetect=noise={silence_thresh}:d={min_silence_dur}",
            "-f",
            "null",
            "-",
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
        )
        if result.returncode != 0:
            logger.warning(
                "Silence detection exited with code {}: {}",
                result.returncode,
                (result.stderr or "")[-500:],
            )
            return ""
        return "\n".join(part for part in (result.stdout, result.stderr) if part)

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

        try:
            output = AudioProcessor._run_silence_detection(
                audio_path,
                silence_thresh=silence_thresh,
                min_silence_dur=min_silence_dur,
            )
            intervals = AudioProcessor.parse_silence_intervals(output)
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
    def prepare_for_transcription(audio_path: str, output_path: Path) -> Path:
        """Create the canonical 16 kHz mono lossless input consumed by every ASR engine."""
        source_path = Path(audio_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Audio file not found: {source_path}")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        channel_count, duration = AudioProcessor._probe_audio_stream(source_path)
        audio_filter = None

        if channel_count == 2:
            phase_values = AudioProcessor._measure_stereo_phase(source_path, duration)
            if AudioProcessor._is_strongly_antiphase(phase_values):
                audio_filter = "pan=mono|c0=0.5*c0-0.5*c1"
                logger.warning(
                    "Strong stereo phase inversion detected; using phase-corrected ASR downmix."
                )
            else:
                audio_filter = "pan=mono|c0=0.5*c0+0.5*c1"

        cmd = [
            settings.FFMPEG_PATH,
            "-y",
            "-i",
            str(source_path),
            "-map",
            "0:a:0",
            "-vn",
        ]
        if audio_filter:
            cmd.extend(["-af", audio_filter])
        else:
            cmd.extend(["-ac", "1"])
        cmd.extend(["-ar", "16000", "-c:a"])
        if output_path.suffix.lower() == ".flac":
            cmd.extend(["flac", "-compression_level", "5"])
        else:
            cmd.append("pcm_s16le")
        cmd.append(str(output_path))

        subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            shell=False,
        )
        return output_path

    @staticmethod
    def _probe_audio_stream(audio_path: Path) -> tuple[int, float]:
        result = subprocess.run(
            [
                settings.FFPROBE_PATH,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=channels:format=duration",
                "-of",
                "json",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
            shell=False,
        )
        probe = json.loads(result.stdout)
        streams = probe.get("streams", [])
        if not streams:
            raise ValueError(f"Media has no audio stream: {audio_path}")
        duration = float(probe.get("format", {}).get("duration") or 0.0)
        return int(streams[0]["channels"]), duration

    @staticmethod
    def _measure_stereo_phase(audio_path: Path, duration: float) -> list[float]:
        windows: list[tuple[float, float | None]]
        if duration <= 90:
            windows = [(0.0, None)]
        else:
            windows = [
                (0.0, 30.0),
                (max(duration / 2 - 15.0, 0.0), 30.0),
                (max(duration - 30.0, 0.0), 30.0),
            ]

        phase_values: list[float] = []
        for start, window_duration in windows:
            cmd = [
                settings.FFMPEG_PATH,
                "-hide_banner",
            ]
            if start > 0:
                cmd.extend(["-ss", f"{start:.3f}"])
            cmd.extend(["-i", str(audio_path)])
            if window_duration is not None:
                cmd.extend(["-t", f"{window_duration:.3f}"])
            cmd.extend(
                [
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-af",
                    "aphasemeter=video=0,ametadata=print:key=lavfi.aphasemeter.phase:file=-",
                    "-f",
                    "null",
                    "-",
                ]
            )
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=True,
                shell=False,
            )
            phase_values.extend(
                float(match.group(1))
                for match in re.finditer(
                    r"lavfi\.aphasemeter\.phase=(-?\d+(?:\.\d+)?)",
                    result.stdout,
                )
            )
        return phase_values

    @staticmethod
    def _is_strongly_antiphase(phase_values: list[float]) -> bool:
        if not phase_values:
            return False
        median_phase = statistics.median(phase_values)
        negative_frame_ratio = sum(
            value < AudioProcessor.STRONG_ANTIPHASE_MEDIAN_THRESHOLD
            for value in phase_values
        ) / len(phase_values)
        logger.info(
            "Stereo phase analysis: median={:.3f}, strong_negative_ratio={:.1%}",
            median_phase,
            negative_frame_ratio,
        )
        return (
            median_phase < AudioProcessor.STRONG_ANTIPHASE_MEDIAN_THRESHOLD
            and negative_frame_ratio >= AudioProcessor.STRONG_ANTIPHASE_FRAME_RATIO
        )

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
        
        for idx, end_point in enumerate(all_points):
            chunk_filename = f"chunk_{idx:03d}.wav"
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
    def build_audio_chunk_ranges(
        duration: float,
        split_points: List[float],
    ) -> List[Tuple[float, float]]:
        """Build non-overlapping time ranges without creating derivative files."""
        valid_points = sorted({
            float(point)
            for point in split_points
            if 0 < float(point) < duration
        })
        boundaries = [0.0, *valid_points, max(0.0, duration)]
        return [
            (start, end)
            for start, end in zip(boundaries, boundaries[1:])
            if end > start
        ]

    @staticmethod
    def decode_audio_range(audio_path: str, start: float, end: float):
        """Decode one ASR range directly to an in-memory float32 waveform."""
        if not Path(audio_path).is_file():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        if end <= start:
            raise ValueError("Audio range end must be greater than start")

        cmd = [
            settings.FFMPEG_PATH,
            "-hide_banner",
            "-v",
            "error",
            "-ss",
            f"{start:.6f}",
            "-i",
            audio_path,
            "-t",
            f"{end - start:.6f}",
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "f32le",
            "pipe:1",
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            shell=False,
        )
        import numpy as np

        audio = np.frombuffer(result.stdout, dtype="<f4")
        if audio.size == 0:
            raise RuntimeError(f"Decoded audio range is empty: {start:.3f}-{end:.3f}")
        return audio

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
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            str(output_path_obj)
        ]

        logger.info(f"Extracting segment: {start:.2f}-{end:.2f} to {output_path_obj}")
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, shell=False)
        return str(output_path_obj)

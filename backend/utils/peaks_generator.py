"""
Waveform Peaks Generator

Generates binary peaks data from audio/video files using ffmpeg.
The output file can be loaded directly as Float32Array in the frontend,
enabling instant waveform rendering without client-side audio decoding.
"""
import struct
import subprocess
import hashlib
import threading
import time
import os
from pathlib import Path
from loguru import logger
from backend.config import settings


_inflight_lock = threading.Lock()
_inflight_generations: dict[str, threading.Event] = {}


def _get_cache_dir() -> Path:
    """Get (and ensure) the peaks cache directory."""
    # Use hidden temp dir instead of workspace
    cache_dir = settings.TEMP_DIR / "peaks"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir

def _cleanup_old_files(max_age_days: int = 7):
    """Delete peaks files older than max_age_days."""
    try:
        cache_dir = _get_cache_dir()
        now = time.time()
        max_age_sec = max_age_days * 86400
        
        for p in cache_dir.glob("*.bin"):
            if p.is_file():
                try:
                    mtime = p.stat().st_mtime
                    if now - mtime > max_age_sec:
                        p.unlink()
                        logger.debug(f"[PeaksGen] Cleaned up old peaks file: {p.name}")
                except Exception as e:
                    pass # Ignore file access errors during cleanup
    except Exception as e:
        logger.warning(f"[PeaksGen] Cleanup failed: {e}")

def get_peaks_path(media_path: str, suffix: str = ".peaks.bin") -> Path:
    """Generate a consistent cache path for a media file."""
    # Create a stable hash based on the absolute path
    # We could include file size/mtime to invalidate cache on file change,
    # but path-based is usually sufficient for this use case.
    media_abs = str(Path(media_path).absolute())
    path_hash = hashlib.md5(media_abs.encode("utf-8")).hexdigest()
    
    filename = f"{path_hash}{suffix}"
    return _get_cache_dir() / filename

def generate_peaks(
    media_path: str,
    output_path: str | None = None,
    samples_per_second: int = 100,
) -> str | None:
    """
    Extract audio waveform peaks from a media file using ffmpeg.

    Args:
        media_path: Path to the audio/video file.
        output_path: Path for the output .peaks.bin file. 
                     If None, saves to workspace/cache/peaks/{hash}.peaks.bin
        samples_per_second: Number of peak samples per second of audio. 
                           Higher = more detail. 100 is good for normal zoom levels.

    Returns:
        The output file path on success, None on failure.
    """
    media = Path(media_path)
    if not media.exists():
        logger.error(f"[PeaksGen] Media file not found: {media_path}")
        return None

    # Determine Output Path
    if output_path is None:
        # User requested managed path -> Trigger cleanup
        _cleanup_old_files() 
        output_path = str(get_peaks_path(media_path))

    output = Path(output_path)
    if output.exists():
        logger.debug(f"[PeaksGen] Peaks file already exists: {output_path}")
        return output_path

    is_leader = False
    generation_event: threading.Event | None = None
    with _inflight_lock:
        if output.exists():
            logger.debug(f"[PeaksGen] Peaks file already exists: {output_path}")
            return output_path
        generation_event = _inflight_generations.get(output_path)
        if generation_event is None:
            generation_event = threading.Event()
            _inflight_generations[output_path] = generation_event
            is_leader = True

    if not is_leader:
        logger.debug(f"[PeaksGen] Waiting for in-flight peaks generation: {output_path}")
        generation_event.wait(timeout=310)
        if output.exists():
            return output_path
        logger.warning(f"[PeaksGen] In-flight peaks generation did not produce output: {output_path}")
        return None

    # Step 1: Extract raw audio samples via ffmpeg (mono, downsampled)
    # Using a moderate sample rate for extraction, then we'll compute peaks from chunks
    extraction_rate = 8000  # 8kHz is sufficient for peak visualization
    cmd = [
        settings.FFMPEG_PATH,
        "-i", str(media_path),
        "-ac", "1",                    # Mono
        "-ar", str(extraction_rate),   # Downsample to 8kHz
        "-f", "f32le",                 # Raw 32-bit float, little-endian
        "-acodec", "pcm_f32le",
        "-v", "error",
        "-"                            # Output to stdout
    ]

    try:
        logger.info(f"[PeaksGen] Extracting audio from: {media_path}")
        result = subprocess.run(
            cmd,
            capture_output=True,
            shell=False,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            logger.error(f"[PeaksGen] ffmpeg failed: {stderr[:500]}")
            return None

        raw_bytes = result.stdout
        if len(raw_bytes) < 4:
            logger.error("[PeaksGen] No audio data extracted")
            return None

        # Step 2: Parse raw samples and compute peaks
        num_samples = len(raw_bytes) // 4  # 4 bytes per float32
        samples = struct.unpack(f"<{num_samples}f", raw_bytes)

        # Compute peak (max absolute value) for each chunk
        chunk_size = max(1, extraction_rate // samples_per_second)
        peaks = []
        for i in range(0, num_samples, chunk_size):
            chunk = samples[i : i + chunk_size]
            peak = max(abs(s) for s in chunk) if chunk else 0.0
            peaks.append(peak)

        # Step 3: Write as binary Float32Array
        peak_bytes = struct.pack(f"<{len(peaks)}f", *peaks)
        
        # Ensure dir exists again just in case
        output.parent.mkdir(parents=True, exist_ok=True)

        temp_output = output.with_suffix(f"{output.suffix}.{threading.get_ident()}.tmp")
        with open(temp_output, "wb") as f:
            f.write(peak_bytes)
        os.replace(temp_output, output)

        file_size_kb = len(peak_bytes) / 1024
        logger.success(
            f"[PeaksGen] Generated {len(peaks)} peaks ({file_size_kb:.1f} KB) -> {output_path}"
        )
        return output_path

    except subprocess.TimeoutExpired:
        logger.error(f"[PeaksGen] Timeout extracting audio from: {media_path}")
        return None
    except Exception as e:
        logger.error(f"[PeaksGen] Failed to generate peaks: {e}")
        return None
    finally:
        if is_leader and generation_event is not None:
            with _inflight_lock:
                _inflight_generations.pop(output_path, None)
            generation_event.set()


def start_peaks_warmup(
    media_path: str,
    samples_per_second: int = 100,
) -> None:
    """Start a background warmup for the canonical peaks cache."""

    worker = threading.Thread(
        target=generate_peaks,
        kwargs={
            "media_path": media_path,
            "output_path": None,
            "samples_per_second": samples_per_second,
        },
        name=f"peaks-warmup-{Path(media_path).stem}",
        daemon=True,
    )
    worker.start()

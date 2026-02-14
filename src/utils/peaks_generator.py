"""
Waveform Peaks Generator

Generates binary peaks data from audio/video files using ffmpeg.
The output file can be loaded directly as Float32Array in the frontend,
enabling instant waveform rendering without client-side audio decoding.
"""
import struct
import subprocess
from pathlib import Path
from loguru import logger
from src.config import settings


def generate_peaks(
    media_path: str,
    output_path: str | None = None,
    samples_per_second: int = 100,
) -> str | None:
    """
    Extract audio waveform peaks from a media file using ffmpeg.

    Args:
        media_path: Path to the audio/video file.
        output_path: Path for the output .peaks.bin file. Defaults to {media_path}.peaks.bin.
        samples_per_second: Number of peak samples per second of audio. 
                           Higher = more detail. 100 is good for normal zoom levels.

    Returns:
        The output file path on success, None on failure.
    """
    media = Path(media_path)
    if not media.exists():
        logger.error(f"[PeaksGen] Media file not found: {media_path}")
        return None

    if output_path is None:
        output_path = str(media) + ".peaks.bin"

    if Path(output_path).exists():
        logger.debug(f"[PeaksGen] Peaks file already exists: {output_path}")
        return output_path

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
        with open(output_path, "wb") as f:
            f.write(peak_bytes)

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


def generate_multi_resolution_peaks(
    media_path: str,
    hi_samples_per_second: int = 100,
    lo_samples_per_second: int = 10,
) -> tuple[str | None, str | None]:
    """
    Generate both high-resolution and low-resolution peaks files.

    Returns:
        Tuple of (hi_res_path, lo_res_path). Either may be None on failure.
    """
    hi_path = generate_peaks(media_path, samples_per_second=hi_samples_per_second)

    # Low-res: separate file with .peaks.low.bin suffix
    lo_output = str(media_path) + ".peaks.low.bin"
    lo_path = generate_peaks(
        media_path,
        output_path=lo_output,
        samples_per_second=lo_samples_per_second,
    )

    return hi_path, lo_path

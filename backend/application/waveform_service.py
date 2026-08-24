from __future__ import annotations

import math
import struct
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from backend.config import settings
from backend.models.waveform_contract import (
    WAVEFORM_DEFAULT_RESPONSE_POINTS,
    WAVEFORM_MAX_POINTS,
)
from backend.services.video.media_prober import MediaProber
from backend.utils.bounded_cache import prune_cache_directory

WAVEFORM_CACHE_SCHEMA_VERSION = 2
WAVEFORM_BINARY_VERSION = 1
WAVEFORM_BINARY_MAGIC = b"MFWF"
WAVEFORM_BINARY_HEADER = struct.Struct("<4sHHdIf")
WAVEFORM_SAMPLE_RATE = 8_000
WAVEFORM_BUCKETS_PER_SECOND = 100
WAVEFORM_CACHE_MAX_BYTES = 512 * 1024 * 1024
WAVEFORM_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
WAVEFORM_CACHE_PRUNE_INTERVAL_SECONDS = 5 * 60

_waveform_decode_slots = threading.BoundedSemaphore(2)
_waveform_cache_locks = tuple(threading.Lock() for _ in range(64))
_waveform_prune_lock = threading.Lock()
_last_waveform_prune_at = 0.0


@dataclass(frozen=True)
class WaveformEnvelope:
    duration: float
    peaks: np.ndarray

    @property
    def points_per_second(self) -> float:
        return float(self.peaks.size) / self.duration if self.duration > 0 else 0.0


def _cache_dir() -> Path:
    path = settings.TEMP_DIR / "editor-waveforms"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_path(source: Path) -> Path:
    import hashlib

    stat = source.stat()
    identity = (
        f"v{WAVEFORM_CACHE_SCHEMA_VERSION}|{source.resolve()}|"
        f"{stat.st_size}|{stat.st_mtime_ns}"
    )
    key = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    return _cache_dir() / f"{key}.mfwf"


def _maybe_prune_waveform_cache(cache_dir: Path, *, protected: Path) -> None:
    global _last_waveform_prune_at

    now = time.monotonic()
    if now - _last_waveform_prune_at < WAVEFORM_CACHE_PRUNE_INTERVAL_SECONDS:
        return
    with _waveform_prune_lock:
        now = time.monotonic()
        if now - _last_waveform_prune_at < WAVEFORM_CACHE_PRUNE_INTERVAL_SECONDS:
            return
        prune_cache_directory(
            cache_dir,
            max_bytes=WAVEFORM_CACHE_MAX_BYTES,
            max_age_seconds=WAVEFORM_CACHE_MAX_AGE_SECONDS,
            protected=(protected,),
        )
        _last_waveform_prune_at = now


def encode_waveform_binary(envelope: WaveformEnvelope) -> bytes:
    peaks = np.asarray(envelope.peaks, dtype="<f4")
    header = WAVEFORM_BINARY_HEADER.pack(
        WAVEFORM_BINARY_MAGIC,
        WAVEFORM_BINARY_VERSION,
        1,
        float(envelope.duration),
        int(peaks.size),
        float(envelope.points_per_second),
    )
    return header + peaks.tobytes(order="C")


def decode_waveform_binary(payload: bytes) -> WaveformEnvelope:
    if len(payload) < WAVEFORM_BINARY_HEADER.size:
        raise ValueError("Waveform payload is shorter than its header")
    magic, version, channels, duration, point_count, _points_per_second = (
        WAVEFORM_BINARY_HEADER.unpack_from(payload)
    )
    if magic != WAVEFORM_BINARY_MAGIC or version != WAVEFORM_BINARY_VERSION:
        raise ValueError("Unsupported waveform binary format")
    if channels != 1 or point_count < 2 or point_count % 2:
        raise ValueError("Waveform payload has an invalid channel or point count")
    if not math.isfinite(duration) or duration < 0:
        raise ValueError("Waveform payload has an invalid duration")
    expected_size = WAVEFORM_BINARY_HEADER.size + point_count * 4
    if len(payload) != expected_size:
        raise ValueError("Waveform payload size does not match its header")
    peaks = np.frombuffer(
        payload,
        dtype="<f4",
        count=point_count,
        offset=WAVEFORM_BINARY_HEADER.size,
    )
    if not np.isfinite(peaks).all():
        raise ValueError("Waveform payload contains non-finite peaks")
    return WaveformEnvelope(duration=float(duration), peaks=peaks)


def _read_cached_waveform(path: Path) -> WaveformEnvelope | None:
    if not path.is_file():
        return None
    try:
        envelope = decode_waveform_binary(path.read_bytes())
        path.touch()
        return envelope
    except (OSError, ValueError, TypeError, struct.error):
        return None


def _write_cached_waveform(path: Path, envelope: WaveformEnvelope) -> None:
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp_path.write_bytes(encode_waveform_binary(envelope))
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def _flat_waveform(duration: float) -> WaveformEnvelope:
    return WaveformEnvelope(
        duration=max(0.0, duration),
        peaks=np.zeros(2, dtype=np.float32),
    )


def _decode_peak_envelope(source: Path, duration: float) -> np.ndarray:
    target_bucket_count = max(
        1,
        min(
            WAVEFORM_MAX_POINTS // 2,
            math.ceil(max(duration, 0.01) * WAVEFORM_BUCKETS_PER_SECOND),
        ),
    )
    estimated_samples = max(1, math.ceil(duration * WAVEFORM_SAMPLE_RATE))
    bucket_size = max(1, math.ceil(estimated_samples / target_bucket_count))

    process = subprocess.Popen(
        [
            settings.FFMPEG_PATH,
            "-hide_banner",
            "-v",
            "error",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(WAVEFORM_SAMPLE_RATE),
            "-f",
            "s16le",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None

    stderr_tail = bytearray()

    def drain_stderr() -> None:
        if process.stderr is None:
            return
        while chunk := process.stderr.read(64 * 1024):
            stderr_tail.extend(chunk)
            if len(stderr_tail) > 1_000:
                del stderr_tail[:-1_000]

    stderr_thread = threading.Thread(
        target=drain_stderr,
        name="waveform-ffmpeg-stderr",
        daemon=True,
    )
    stderr_thread.start()

    peak_chunks: list[np.ndarray] = []
    pending_byte = b""
    remainder = np.empty(0, dtype="<i2")

    while True:
        chunk = process.stdout.read(256 * 1024)
        if not chunk:
            break
        data = pending_byte + chunk
        if len(data) % 2:
            pending_byte = data[-1:]
            data = data[:-1]
        else:
            pending_byte = b""
        samples = np.frombuffer(data, dtype="<i2")
        if remainder.size:
            samples = np.concatenate((remainder, samples))
        complete_sample_count = (samples.size // bucket_size) * bucket_size
        if complete_sample_count:
            buckets = samples[:complete_sample_count].reshape(-1, bucket_size)
            chunk_peaks = np.empty(buckets.shape[0] * 2, dtype=np.float32)
            chunk_peaks[0::2] = buckets.min(axis=1).astype(np.float32) / 32768.0
            chunk_peaks[1::2] = buckets.max(axis=1).astype(np.float32) / 32768.0
            peak_chunks.append(chunk_peaks)
        remainder = samples[complete_sample_count:].copy()

    if remainder.size:
        peak_chunks.append(
            np.asarray(
                [remainder.min() / 32768.0, remainder.max() / 32768.0],
                dtype=np.float32,
            )
        )

    return_code = process.wait()
    stderr_thread.join()
    if return_code != 0:
        message = bytes(stderr_tail).decode("utf-8", errors="replace")
        raise RuntimeError(f"Failed to decode waveform audio: {message}")
    if not peak_chunks:
        return np.zeros(2, dtype=np.float32)
    return np.concatenate(peak_chunks)


def _downsample_peaks(peaks: np.ndarray, max_points: int) -> np.ndarray:
    target_bucket_count = max(1, int(max_points) // 2)
    source_buckets = np.asarray(peaks, dtype=np.float32).reshape(-1, 2)
    if target_bucket_count >= source_buckets.shape[0]:
        return source_buckets.reshape(-1)

    boundaries = (
        np.arange(target_bucket_count + 1, dtype=np.int64)
        * source_buckets.shape[0]
        // target_bucket_count
    )
    reduced = np.empty((target_bucket_count, 2), dtype=np.float32)
    reduced[:, 0] = np.minimum.reduceat(source_buckets[:, 0], boundaries[:-1])
    reduced[:, 1] = np.maximum.reduceat(source_buckets[:, 1], boundaries[:-1])
    return reduced.reshape(-1)


def resolve_waveform(source_path: str) -> WaveformEnvelope:
    source = Path(source_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Media file not found: {source}")

    cache_path = _cache_path(source)
    cached = _read_cached_waveform(cache_path)
    if cached is not None:
        _maybe_prune_waveform_cache(cache_path.parent, protected=cache_path)
        return cached

    cache_lock = _waveform_cache_locks[hash(cache_path) % len(_waveform_cache_locks)]
    with cache_lock:
        cached = _read_cached_waveform(cache_path)
        if cached is not None:
            _maybe_prune_waveform_cache(cache_path.parent, protected=cache_path)
            return cached

        media_info = MediaProber.probe_media(str(source))
        duration = max(0.0, media_info.duration)
        if not media_info.has_audio:
            envelope = _flat_waveform(duration)
        else:
            with _waveform_decode_slots:
                peaks = _decode_peak_envelope(source, duration)
            envelope = WaveformEnvelope(
                duration=duration,
                peaks=_downsample_peaks(peaks, WAVEFORM_MAX_POINTS),
            )
        _write_cached_waveform(cache_path, envelope)
        _maybe_prune_waveform_cache(cache_path.parent, protected=cache_path)
        return envelope


def resolve_waveform_binary(
    source_path: str,
    *,
    max_points: int = WAVEFORM_DEFAULT_RESPONSE_POINTS,
) -> bytes:
    envelope = resolve_waveform(source_path)
    return encode_waveform_binary(
        WaveformEnvelope(
            duration=envelope.duration,
            peaks=_downsample_peaks(envelope.peaks, max_points),
        )
    )

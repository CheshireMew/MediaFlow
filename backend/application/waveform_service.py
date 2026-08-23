from __future__ import annotations

import json
import math
import subprocess
import threading
import time
import uuid
from array import array
from pathlib import Path

from backend.config import settings
from backend.services.video.media_prober import MediaProber
from backend.utils.bounded_cache import prune_cache_directory

WAVEFORM_CACHE_SCHEMA_VERSION = 1
WAVEFORM_SAMPLE_RATE = 8_000
WAVEFORM_BUCKETS_PER_SECOND = 100
WAVEFORM_MAX_POINTS = 1_500_000
WAVEFORM_CACHE_MAX_BYTES = 512 * 1024 * 1024
WAVEFORM_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
WAVEFORM_CACHE_PRUNE_INTERVAL_SECONDS = 5 * 60

_waveform_decode_slots = threading.BoundedSemaphore(2)
_waveform_cache_locks = tuple(threading.Lock() for _ in range(64))
_waveform_prune_lock = threading.Lock()
_last_waveform_prune_at = 0.0


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
    return _cache_dir() / f"{key}.json"


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


def _read_cached_waveform(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text("utf-8"))
        if (
            payload.get("schema_version") != WAVEFORM_CACHE_SCHEMA_VERSION
            or not isinstance(payload.get("peaks"), list)
            or not payload["peaks"]
            or not isinstance(payload["peaks"][0], list)
        ):
            return None
        path.touch()
        return payload
    except (OSError, ValueError, TypeError):
        return None


def _write_cached_waveform(path: Path, payload: dict) -> None:
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            "utf-8",
        )
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def _flat_waveform(duration: float) -> dict:
    return {
        "schema_version": WAVEFORM_CACHE_SCHEMA_VERSION,
        "duration": max(0.0, duration),
        "points_per_second": 0.0,
        "peaks": [[0.0]],
    }


def _decode_peak_envelope(source: Path, duration: float) -> list[float]:
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

    peaks: list[float] = []
    pending_byte = b""
    bucket_min = 0
    bucket_max = 0
    bucket_samples = 0

    while True:
        chunk = process.stdout.read(64 * 1024)
        if not chunk:
            break
        data = pending_byte + chunk
        if len(data) % 2:
            pending_byte = data[-1:]
            data = data[:-1]
        else:
            pending_byte = b""
        samples = array("h")
        samples.frombytes(data)
        for sample in samples:
            bucket_min = min(bucket_min, sample)
            bucket_max = max(bucket_max, sample)
            bucket_samples += 1
            if bucket_samples < bucket_size:
                continue
            peaks.extend((bucket_min / 32768.0, bucket_max / 32768.0))
            bucket_min = 0
            bucket_max = 0
            bucket_samples = 0

    if bucket_samples:
        peaks.extend((bucket_min / 32768.0, bucket_max / 32768.0))

    stderr = process.stderr.read() if process.stderr is not None else b""
    return_code = process.wait()
    if return_code != 0:
        message = stderr.decode("utf-8", errors="replace")[-1000:]
        raise RuntimeError(f"Failed to decode waveform audio: {message}")
    return peaks or [0.0]


def resolve_waveform_peaks(source_path: str) -> dict:
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
            payload = _flat_waveform(duration)
        else:
            with _waveform_decode_slots:
                peaks = _decode_peak_envelope(source, duration)
            payload = {
                "schema_version": WAVEFORM_CACHE_SCHEMA_VERSION,
                "duration": duration,
                "points_per_second": len(peaks) / duration if duration > 0 else 0.0,
                "peaks": [peaks],
            }
        _write_cached_waveform(cache_path, payload)
        _maybe_prune_waveform_cache(cache_path.parent, protected=cache_path)
        return payload

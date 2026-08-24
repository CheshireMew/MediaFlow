from __future__ import annotations

import io
import struct
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from backend.application import waveform_service
from backend.services.video.media_prober import MediaInfo


class _FakeProcess:
    def __init__(self, samples: list[int]):
        self.stdout = io.BytesIO(struct.pack(f"<{len(samples)}h", *samples))
        self.stderr = io.BytesIO()

    def wait(self) -> int:
        return 0


def _configure_cache(monkeypatch, cache_dir: Path) -> None:
    cache_dir.mkdir()
    monkeypatch.setattr(waveform_service, "_cache_dir", lambda: cache_dir)


def _mock_media_probe(monkeypatch, *, duration: float, has_audio: bool) -> list[str]:
    calls: list[str] = []

    def probe(path: str) -> MediaInfo:
        calls.append(path)
        return MediaInfo(
            duration=duration,
            width=1920,
            height=1080,
            has_audio=has_audio,
        )

    monkeypatch.setattr(
        waveform_service.MediaProber,
        "probe_media",
        probe,
    )
    return calls


def test_resolve_waveform_streams_peaks_and_reuses_cache(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.wav"
    source.write_bytes(b"media")
    _configure_cache(monkeypatch, tmp_path / "cache")
    probe_calls = _mock_media_probe(monkeypatch, duration=1.0, has_audio=True)

    process_calls = 0

    def fake_popen(*_args, **_kwargs):
        nonlocal process_calls
        process_calls += 1
        return _FakeProcess([-32768, -16384, 0, 16384, 32767])

    monkeypatch.setattr(waveform_service.subprocess, "Popen", fake_popen)

    first = waveform_service.resolve_waveform(str(source))
    second = waveform_service.resolve_waveform(str(source))

    assert process_calls == 1
    assert len(probe_calls) == 1
    assert second.duration == first.duration
    np.testing.assert_array_equal(second.peaks, first.peaks)
    assert first.duration == 1.0
    np.testing.assert_allclose(first.peaks, [-1.0, 32767 / 32768.0])
    assert first.peaks.size <= waveform_service.WAVEFORM_MAX_POINTS
    assert next((tmp_path / "cache").glob("*.mfwf"), None) is not None


def test_resolve_waveform_coalesces_concurrent_requests(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media")
    _configure_cache(monkeypatch, tmp_path / "cache")
    probe_calls = _mock_media_probe(monkeypatch, duration=10.0, has_audio=True)

    decode_calls = 0

    def fake_decode(_source: Path, _duration: float) -> np.ndarray:
        nonlocal decode_calls
        decode_calls += 1
        time.sleep(0.02)
        return np.asarray([-0.5, 0.5], dtype=np.float32)

    monkeypatch.setattr(waveform_service, "_decode_peak_envelope", fake_decode)

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(
            lambda _: waveform_service.resolve_waveform(str(source)),
            range(8),
        ))

    assert decode_calls == 1
    assert len(probe_calls) == 1
    assert all(result.duration == results[0].duration for result in results)
    assert all(np.array_equal(result.peaks, results[0].peaks) for result in results)


def test_resolve_waveform_returns_flat_peaks_without_audio(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media")
    _configure_cache(monkeypatch, tmp_path / "cache")
    _mock_media_probe(monkeypatch, duration=3.5, has_audio=False)
    monkeypatch.setattr(
        waveform_service,
        "_decode_peak_envelope",
        lambda *_: (_ for _ in ()).throw(AssertionError("decoder should not run")),
    )

    result = waveform_service.resolve_waveform(str(source))

    assert result.duration == 3.5
    np.testing.assert_array_equal(result.peaks, [0.0, 0.0])


def test_waveform_binary_downsamples_by_extrema_without_json() -> None:
    envelope = waveform_service.WaveformEnvelope(
        duration=4.0,
        peaks=np.asarray(
            [-0.1, 0.2, -0.8, 0.4, -0.3, 0.9, -0.2, 0.5],
            dtype=np.float32,
        ),
    )

    reduced = waveform_service.WaveformEnvelope(
        duration=envelope.duration,
        peaks=waveform_service._downsample_peaks(envelope.peaks, 4),
    )
    payload = waveform_service.encode_waveform_binary(reduced)
    decoded = waveform_service.decode_waveform_binary(payload)

    assert payload[:4] == b"MFWF"
    assert len(payload) == waveform_service.WAVEFORM_BINARY_HEADER.size + 4 * 4
    np.testing.assert_allclose(decoded.peaks, [-0.8, 0.4, -0.3, 0.9])

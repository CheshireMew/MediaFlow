from __future__ import annotations

import io
import struct
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

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

    first = waveform_service.resolve_waveform_peaks(str(source))
    second = waveform_service.resolve_waveform_peaks(str(source))

    assert process_calls == 1
    assert len(probe_calls) == 1
    assert second == first
    assert first["duration"] == 1.0
    assert first["peaks"][0] == [-1.0, 32767 / 32768.0]
    assert len(first["peaks"][0]) <= waveform_service.WAVEFORM_MAX_POINTS


def test_resolve_waveform_coalesces_concurrent_requests(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media")
    _configure_cache(monkeypatch, tmp_path / "cache")
    probe_calls = _mock_media_probe(monkeypatch, duration=10.0, has_audio=True)

    decode_calls = 0

    def fake_decode(_source: Path, _duration: float) -> list[float]:
        nonlocal decode_calls
        decode_calls += 1
        time.sleep(0.02)
        return [-0.5, 0.5]

    monkeypatch.setattr(waveform_service, "_decode_peak_envelope", fake_decode)

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(
            lambda _: waveform_service.resolve_waveform_peaks(str(source)),
            range(8),
        ))

    assert decode_calls == 1
    assert len(probe_calls) == 1
    assert all(result == results[0] for result in results)


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

    result = waveform_service.resolve_waveform_peaks(str(source))

    assert result["duration"] == 3.5
    assert result["peaks"] == [[0.0]]

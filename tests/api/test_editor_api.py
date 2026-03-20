from pathlib import Path


def test_get_peaks_generates_missing_cache(client, tmp_path, monkeypatch):
    video_path = tmp_path / "sample.mp4"
    video_path.write_bytes(b"fake-video")

    generated_peaks_path = tmp_path / "sample.peaks.bin"
    generated_peaks_path.write_bytes(b"\x01\x02\x03\x04")

    initial_cache_path = tmp_path / "missing.peaks.bin"

    monkeypatch.setattr(
        "backend.utils.peaks_generator.get_peaks_path",
        lambda _: initial_cache_path,
    )
    monkeypatch.setattr(
        "backend.utils.peaks_generator.generate_peaks",
        lambda _video_path, output_path=None: str(generated_peaks_path),
    )

    response = client.get(
        "/api/v1/editor/peaks",
        params={"video_path": str(video_path.resolve())},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.content == generated_peaks_path.read_bytes()

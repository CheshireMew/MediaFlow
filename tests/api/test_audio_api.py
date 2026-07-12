def test_detect_silence_requires_audio_reference(client):
    response = client.post(
        "/api/v1/audio/detect-silence",
        json={"file_path": "E:/legacy/audio.wav"},
    )

    assert response.status_code == 422


def test_detect_silence_uses_canonical_audio_reference(client, tmp_path, monkeypatch):
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"wave")
    captured = {}

    def fake_detect_silence(path, *, silence_thresh, min_silence_dur):
        captured.update(
            path=path,
            silence_thresh=silence_thresh,
            min_silence_dur=min_silence_dur,
        )
        return [(1.0, 2.5)]

    monkeypatch.setattr(
        "backend.utils.audio_processor.AudioProcessor.detect_silence",
        fake_detect_silence,
    )

    response = client.post(
        "/api/v1/audio/detect-silence",
        json={
            "audio_ref": {"path": str(audio_path), "name": audio_path.name},
            "threshold": "-24dB",
            "min_duration": 0.75,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"silence_intervals": [[1.0, 2.5]]}
    assert captured == {
        "path": str(audio_path.resolve()),
        "silence_thresh": "-24dB",
        "min_silence_dur": 0.75,
    }

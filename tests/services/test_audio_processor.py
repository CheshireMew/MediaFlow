from backend.utils.audio_processor import AudioProcessor


def test_parse_silence_intervals_preserves_order_and_closes_trailing_silence():
    output = (
        "[silencedetect] silence_start: 0\n"
        "[silencedetect] silence_end: 0.25 | silence_duration: 0.25\n"
        "[silencedetect] silence_start: 4.5"
    )

    assert AudioProcessor.parse_silence_intervals(
        output,
        media_duration=10.0,
    ) == [(0.0, 0.25), (4.5, 10.0)]

from backend.services.video.media_prober import MediaProber


def test_parse_leading_black_end_accepts_short_black_run_at_origin():
    output = "[Parsed_blackdetect_0] black_start:0 black_end:0.0349609 black_duration:0.0349609"

    assert MediaProber.parse_leading_black_end(output) == 0.0349609


def test_parse_leading_black_end_ignores_intentional_long_black_run():
    output = "[Parsed_blackdetect_0] black_start:0 black_end:1.2 black_duration:1.2"

    assert MediaProber.parse_leading_black_end(output) == 0.0


def test_parse_leading_black_end_ignores_later_black_run():
    output = "[Parsed_blackdetect_0] black_start:3.0 black_end:3.1 black_duration:0.1"

    assert MediaProber.parse_leading_black_end(output) == 0.0

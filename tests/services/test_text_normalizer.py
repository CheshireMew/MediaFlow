from backend.utils.text_normalizer import (
    normalize_external_text,
    normalize_filename_component,
    repair_mojibake_text,
)


def test_repair_mojibake_text_recovers_gbk_decoded_utf8_quotes():
    bad = "鈥淲on鈥檛 Replace"
    assert repair_mojibake_text(bad) == "“Won’t Replace"


def test_normalize_external_text_keeps_clean_text():
    clean = "英伟达 Jensen Huang"
    assert normalize_external_text(clean) == clean


def test_normalize_filename_component_strips_surrogates_and_invalid_chars():
    raw = "Patient Investor - 鈥淎I Won鈥檛 Replace Software!鈥\udc9d 鈥\udc94 Jensen Huang: $CSU?"
    normalized = normalize_filename_component(raw)
    assert "Won" in normalized
    assert "Replace Software!" in normalized
    assert "Jensen Huang" in normalized
    assert ":" not in normalized
    assert "?" not in normalized
    assert "\udc9d" not in normalized
    assert "\udc94" not in normalized

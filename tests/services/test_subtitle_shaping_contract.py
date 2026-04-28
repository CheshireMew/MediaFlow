import json
from pathlib import Path

import pytest

from backend.utils import text_shaper


CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "subtitle-shaping-cases.json"


def _load_cases():
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["name"])
def test_backend_subtitle_shaping_contract(case, monkeypatch):
    font_family = case.get("fontFamily")
    font_measure = case.get("fontMeasure")
    if font_family and font_measure:
        monkeypatch.setattr(text_shaper, "_resolve_font_path", lambda _font_name: "contract-font.ttf")

        def measure(text, _font_name, _font_size):
            default_width = float(font_measure["default"])
            return sum(float(font_measure.get(ch, default_width)) for ch in text)

        monkeypatch.setattr(text_shaper, "_measure_text_width", measure)

    shaped = text_shaper.shape(
        r"\N".join(case["inputLines"]),
        max_width_px=int(case["maxWidthPx"]),
        font_size=int(case["fontSize"]),
        font_name=font_family,
    )

    assert shaped.split(r"\N") == case["expectedLines"]

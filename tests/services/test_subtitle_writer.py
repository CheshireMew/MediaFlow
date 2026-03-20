from pathlib import Path

from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils import text_shaper


def test_convert_srt_to_ass_preserves_single_line_margin_v(tmp_path: Path):
    srt_path = tmp_path / "sample.srt"
    ass_path = tmp_path / "sample.ass"
    srt_path.write_text(
        "1\n00:00:01,000 --> 00:00:02,000\nSingle line subtitle\n",
        encoding="utf-8",
    )

    ok = SubtitleWriter.convert_srt_to_ass(
        str(srt_path),
        str(ass_path),
        style_options={"margin_v": 132},
    )

    assert ok is True
    content = ass_path.read_text(encoding="utf-8-sig")
    assert "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,132,,Single line subtitle" in content


def test_text_shaper_uses_font_measurement_when_available(monkeypatch):
    monkeypatch.setattr(text_shaper, "_resolve_font_path", lambda _font_name: "fake-font.ttf")
    monkeypatch.setattr(text_shaper, "_measure_text_width", lambda text, _font_name, _font_size: 8.0 * len(text))

    shaped = text_shaper.shape("WWW", max_width_px=24, font_size=24, font_name="Arial")

    assert shaped == "WWW"

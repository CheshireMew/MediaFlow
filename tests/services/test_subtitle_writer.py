from pathlib import Path

from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils import text_shaper
from backend.models.schemas import SubtitleSegment


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


def test_convert_srt_to_ass_pins_split_lines_in_reading_order(tmp_path: Path):
    srt_path = tmp_path / "multiline.srt"
    ass_path = tmp_path / "multiline.ass"
    srt_path.write_text(
        "1\n00:00:01,000 --> 00:00:02,000\nfirst\nsecond\nthird\n",
        encoding="utf-8",
    )

    ok = SubtitleWriter.convert_srt_to_ass(
        str(srt_path),
        str(ass_path),
        style_options={
            "alignment": 2,
            "video_width": 960,
            "video_height": 720,
            "margin_v": 72,
            "line_step": 70,
            "multiline_align": "center",
        },
    )

    assert ok is True
    content = ass_path.read_text(encoding="utf-8-sig")
    assert "{\\pos(480,578)}first" in content
    assert "{\\pos(480,648)}second" in content
    assert "{\\pos(480,718)}third" in content


def test_text_shaper_uses_font_measurement_when_available(monkeypatch):
    monkeypatch.setattr(text_shaper, "_resolve_font_path", lambda _font_name: "fake-font.ttf")
    monkeypatch.setattr(text_shaper, "_measure_text_width", lambda text, _font_name, _font_size: 8.0 * len(text))

    shaped = text_shaper.shape("WWW", max_width_px=24, font_size=24, font_name="Arial")

    assert shaped == "WWW"


def test_save_srt_replaces_transport_stream_suffix(tmp_path: Path):
    media_path = tmp_path / "sample.ts"

    output_path = SubtitleWriter.save_srt(
        [SubtitleSegment(id="1", start=0.0, end=1.0, text="hello")],
        str(media_path),
    )

    assert output_path == str(tmp_path / "sample.srt")
    assert (tmp_path / "sample.srt").exists()

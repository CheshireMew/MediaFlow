from io import BytesIO
from pathlib import Path

from PIL import Image

from backend.application import watermark_preview_service


def test_watermark_preview_uses_short_temp_input_path(monkeypatch, tmp_path):
    temp_dir = tmp_path / "temp"
    user_data_dir = tmp_path / "user_data"
    temp_dir.mkdir()
    monkeypatch.setattr(watermark_preview_service.settings, "TEMP_DIR", temp_dir)
    monkeypatch.setattr(watermark_preview_service.settings, "USER_DATA_DIR", user_data_dir)
    monkeypatch.setattr(watermark_preview_service.time, "sleep", lambda *_args, **_kwargs: None)

    long_name = (
        "X 上的 CopyRebeldia Hoy una industria entera dejo de tener sentido "
        "un tio publico en GitHub un repo que convierte cualquier foto en un mundo 3D.png"
    )
    captured_input_paths: list[Path] = []

    def fake_process_watermark(input_path: str) -> str:
        path = Path(input_path)
        captured_input_paths.append(path)
        assert path.parent.parent == temp_dir
        assert path.name == "input.png"
        output_path = path.with_name("processed.png")
        Image.new("RGBA", (1, 1), (255, 255, 255, 255)).save(output_path)
        return str(output_path)

    monkeypatch.setattr(
        watermark_preview_service.WatermarkProcessor,
        "process_watermark",
        fake_process_watermark,
    )

    preview = watermark_preview_service.save_watermark_preview(
        long_name,
        BytesIO(b"fake-image"),
    )

    assert preview["width"] == 1
    assert preview["height"] == 1
    assert Path(preview["png_path"]) == user_data_dir / "watermarks" / "latest.png"
    assert len(captured_input_paths) == 1
    assert long_name not in str(captured_input_paths[0])
    assert not captured_input_paths[0].parent.exists()

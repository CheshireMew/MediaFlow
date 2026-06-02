from pathlib import Path
import subprocess

from backend.application.editor_preview_service import resolve_editor_preview_media
from backend.config import settings


def test_resolve_editor_preview_media_uses_original_for_browser_playable_video(tmp_path: Path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")

    source_ref, media_ref, remuxed = resolve_editor_preview_media(str(source))

    assert source_ref.path == str(source.resolve())
    assert media_ref.path == str(source.resolve())
    assert remuxed is False


def test_resolve_editor_preview_media_remuxes_transport_stream(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.ts"
    source.write_bytes(b"transport stream")
    monkeypatch.setattr(settings, "TEMP_DIR", tmp_path / "runtime-temp")

    def fake_run(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"mp4 preview")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    source_ref, media_ref, remuxed = resolve_editor_preview_media(str(source))

    assert source_ref.path == str(source.resolve())
    assert Path(media_ref.path).suffix == ".mp4"
    assert Path(media_ref.path).read_bytes() == b"mp4 preview"
    assert remuxed is True

import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.application import editor_preview_service
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


def test_resolve_editor_preview_media_coalesces_concurrent_remuxes(
    tmp_path: Path,
    monkeypatch,
):
    source = tmp_path / "source.ts"
    source.write_bytes(b"transport stream")
    monkeypatch.setattr(settings, "TEMP_DIR", tmp_path / "runtime-temp")
    run_count = 0

    def fake_run(cmd, **kwargs):
        nonlocal run_count
        run_count += 1
        time.sleep(0.02)
        output_path = Path(cmd[-1])
        output_path.write_bytes(b"mp4 preview")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(
            executor.map(
                lambda _: resolve_editor_preview_media(str(source)),
                range(8),
            )
        )

    assert run_count == 1
    assert all(result[1].path == results[0][1].path for result in results)


def test_resolve_editor_preview_media_prunes_expired_cache_entries(
    tmp_path: Path,
    monkeypatch,
):
    source = tmp_path / "source.ts"
    source.write_bytes(b"transport stream")
    cache_dir = tmp_path / "runtime-temp" / "editor-preview-media"
    cache_dir.mkdir(parents=True)
    expired = cache_dir / "expired.mp4"
    expired.write_bytes(b"old preview")
    old_time = time.time() - 100
    expired.touch()
    os.utime(expired, (old_time, old_time))

    monkeypatch.setattr(settings, "TEMP_DIR", tmp_path / "runtime-temp")
    monkeypatch.setattr(editor_preview_service, "PREVIEW_CACHE_MAX_AGE_SECONDS", 1)
    monkeypatch.setattr(editor_preview_service, "PREVIEW_CACHE_PRUNE_INTERVAL_SECONDS", 0)

    def fake_run(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(b"mp4 preview")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    resolve_editor_preview_media(str(source))

    assert not expired.exists()

import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from backend.config import settings
from backend.services.runtime_tool_installer import RuntimeToolInstaller


def _configure_tool_runtime(monkeypatch, root: Path) -> None:
    monkeypatch.setattr(settings, "TOOL_DIR", root / "tools")
    monkeypatch.setattr(settings, "TOOL_DOWNLOAD_DIR", root / "tools" / "downloads")
    monkeypatch.setattr(settings, "PYTHON_TOOL_PACKAGES_DIR", root / "tools" / "python-packages")
    monkeypatch.setattr(settings, "USER_DATA_DIR", root / "user_data")


def _write_yt_dlp_wheel(path: Path, version: str) -> None:
    with zipfile.ZipFile(path, "w") as wheel:
        wheel.writestr("yt_dlp/__init__.py", f"__version__ = {version!r}\n")
        wheel.writestr(f"yt_dlp-{version}.dist-info/METADATA", f"Version: {version}\n")


def test_yt_dlp_install_commits_package_and_provenance(tmp_path, monkeypatch):
    _configure_tool_runtime(monkeypatch, tmp_path)
    wheel_path = tmp_path / "yt_dlp.whl"
    _write_yt_dlp_wheel(wheel_path, "2026.08.23")

    RuntimeToolInstaller._install_yt_dlp_wheel(
        wheel_path,
        version="2026.08.23",
        source_url="https://files.pythonhosted.org/yt_dlp.whl",
        sha256="a" * 64,
    )

    package_root = settings.PYTHON_TOOL_PACKAGES_DIR
    assert (package_root / "yt_dlp" / "__init__.py").is_file()
    assert (package_root / "yt_dlp-2026.08.23.dist-info" / "METADATA").is_file()
    provenance = json.loads(
        (settings.USER_DATA_DIR / "tool-provenance" / "yt-dlp.json").read_text(
            encoding="utf-8"
        )
    )
    assert provenance["version"] == "2026.08.23"
    assert provenance["sha256"] == "a" * 64


def test_yt_dlp_install_restores_previous_package_when_commit_fails(tmp_path, monkeypatch):
    _configure_tool_runtime(monkeypatch, tmp_path)
    package_root = settings.PYTHON_TOOL_PACKAGES_DIR
    (package_root / "yt_dlp").mkdir(parents=True)
    (package_root / "yt_dlp" / "__init__.py").write_text("old\n", encoding="utf-8")
    (package_root / "yt_dlp-previous.dist-info").mkdir()
    wheel_path = tmp_path / "yt_dlp.whl"
    _write_yt_dlp_wheel(wheel_path, "2026.08.23")

    monkeypatch.setattr(
        RuntimeToolInstaller,
        "_record_tool_provenance",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provenance failed")),
    )

    with pytest.raises(RuntimeError, match="provenance failed"):
        RuntimeToolInstaller._install_yt_dlp_wheel(
            wheel_path,
            version="2026.08.23",
            source_url="https://files.pythonhosted.org/yt_dlp.whl",
            sha256="b" * 64,
        )

    assert (package_root / "yt_dlp" / "__init__.py").read_text(encoding="utf-8") == "old\n"
    assert (package_root / "yt_dlp-previous.dist-info").is_dir()
    assert not (package_root / "yt_dlp-2026.08.23.dist-info").exists()


def test_faster_whisper_install_restores_previous_directory_when_commit_fails(
    tmp_path,
    monkeypatch,
):
    _configure_tool_runtime(monkeypatch, tmp_path)
    archive_path = tmp_path / "faster-whisper.7z"
    archive_path.write_bytes(b"archive")
    target_dir = settings.TOOL_DIR / "Faster-Whisper-XXL"
    target_dir.mkdir(parents=True)
    (target_dir / "faster-whisper-xxl.exe").write_bytes(b"old")

    def fake_extract(command, **_kwargs):
        extraction_root = Path(command[command.index("-C") + 1])
        staged = extraction_root / "Faster-Whisper-XXL"
        staged.mkdir()
        (staged / "faster-whisper-xxl.exe").write_bytes(b"new")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("backend.services.runtime_tool_installer.subprocess.run", fake_extract)
    monkeypatch.setattr(
        RuntimeToolInstaller,
        "_record_tool_provenance",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provenance failed")),
    )

    with pytest.raises(RuntimeError, match="provenance failed"):
        RuntimeToolInstaller._install_faster_whisper_archive(
            archive_path=archive_path,
            target_dir=target_dir,
        )

    assert (target_dir / "faster-whisper-xxl.exe").read_bytes() == b"old"

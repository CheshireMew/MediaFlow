import json
from pathlib import Path

import pytest

from backend.config import settings
from backend.configuration.cli_path import existing_cli_path
from backend.configuration.runtime_paths import build_runtime_paths, detect_binary_paths
from backend.models.settings_contracts import UserPreferencesPatch
from backend.services.asr.cli_prewarm import CliPrewarmManager
from backend.services.settings_manager import SettingsManager


@pytest.fixture
def cli_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(SettingsManager, "_file_path", tmp_path / "user_settings.json")
    monkeypatch.setattr(settings, "TOOL_DIR", tmp_path / "tools")
    monkeypatch.setattr(settings, "BIN_DIR", tmp_path / "bin")
    monkeypatch.setattr(settings, "FASTER_WHISPER_CLI_PATH", "")
    return SettingsManager()


def make_cli(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"test executable")
    return path.resolve()


def test_move_recovers_bundled_cli_and_persists_correct_path(cli_settings, tmp_path):
    old_cli = str(tmp_path / "old-drive" / "faster-whisper-xxl.exe")
    cli = make_cli(settings.BIN_DIR / "Faster-Whisper-XXL" / "faster-whisper-xxl.exe")
    cli_settings._file_path.write_text(json.dumps({
        "faster_whisper_cli_path": old_cli,
        "language": "ja",
        "ui_state": {"transcriber": "saved"},
    }), encoding="utf-8")
    settings.FASTER_WHISPER_CLI_PATH = str(cli)

    result = cli_settings.get_settings()

    assert result.faster_whisper_cli_path == str(cli)
    assert result.faster_whisper_cli_available is True
    assert settings.FASTER_WHISPER_CLI_PATH == str(cli)
    stored = json.loads(cli_settings._file_path.read_text(encoding="utf-8"))
    assert stored["faster_whisper_cli_path"] == str(cli)
    assert stored["language"] == "ja"
    assert stored["ui_state"] == {"transcriber": "saved"}
    assert "faster_whisper_cli_available" not in stored


def test_valid_custom_path_keeps_priority_over_bundled_cli(cli_settings, tmp_path):
    custom = make_cli(tmp_path / "custom tools" / "faster-whisper-xxl.exe")
    make_cli(settings.BIN_DIR / "Faster-Whisper-XXL" / "faster-whisper-xxl.exe")

    result = cli_settings.patch_preferences(
        UserPreferencesPatch(faster_whisper_cli_path=f"  {custom}  ")
    )

    assert result.faster_whisper_cli_path == str(custom)
    assert result.faster_whisper_cli_available is True
    assert CliPrewarmManager.available_cli_path() == custom


@pytest.mark.parametrize("kind", ["missing", "directory", "text-file"])
def test_invalid_path_save_preserves_previous_settings(cli_settings, tmp_path, kind):
    cli = make_cli(tmp_path / "working.exe")
    cli_settings.patch_preferences(UserPreferencesPatch(faster_whisper_cli_path=str(cli)))
    before = cli_settings._file_path.read_bytes()
    invalid = tmp_path / "invalid.exe"
    if kind == "directory":
        invalid.mkdir()
    elif kind == "text-file":
        invalid = tmp_path / "notes.txt"
        invalid.write_text("not an executable", encoding="utf-8")

    with pytest.raises(ValueError, match="executable is missing or invalid"):
        cli_settings.patch_preferences(UserPreferencesPatch(faster_whisper_cli_path=str(invalid)))

    assert cli_settings._file_path.read_bytes() == before
    assert settings.FASTER_WHISPER_CLI_PATH == str(cli)


def test_availability_is_rechecked_after_executable_moves(cli_settings, tmp_path):
    cli = make_cli(tmp_path / "working.exe")
    cli_settings.patch_preferences(UserPreferencesPatch(faster_whisper_cli_path=str(cli)))
    cli.rename(tmp_path / "moved.exe")

    result = cli_settings.get_settings()

    assert result.faster_whisper_cli_path == str(cli)
    assert result.faster_whisper_cli_available is False
    assert settings.FASTER_WHISPER_CLI_PATH == ""
    assert CliPrewarmManager.available_cli_path() is None


def test_clear_custom_path_removes_old_runtime_value(cli_settings, tmp_path):
    cli = make_cli(tmp_path / "working.exe")
    cli_settings.patch_preferences(UserPreferencesPatch(faster_whisper_cli_path=str(cli)))

    result = cli_settings.patch_preferences(UserPreferencesPatch(faster_whisper_cli_path=None))

    assert result.faster_whisper_cli_path is None
    assert result.faster_whisper_cli_available is False
    assert settings.FASTER_WHISPER_CLI_PATH == ""


def test_startup_and_prewarm_recover_existing_engine(cli_settings, tmp_path):
    cli = make_cli(settings.TOOL_DIR / "Faster-Whisper-XXL" / "faster-whisper-xxl.exe")
    old_cli = str(tmp_path / "old-drive" / "faster-whisper-xxl.exe")
    paths = build_runtime_paths({"MEDIAFLOW_RUNTIME_DIR": str(tmp_path)})

    _, _, detected = detect_binary_paths(
        paths, ffmpeg_path="ffmpeg", ffprobe_path="ffprobe", faster_whisper_cli_path=old_cli
    )
    settings.FASTER_WHISPER_CLI_PATH = old_cli

    assert detected == str(cli)
    assert CliPrewarmManager.available_cli_path() == cli
    assert settings.FASTER_WHISPER_CLI_PATH == str(cli)


def test_blank_and_directory_paths_are_unavailable(tmp_path):
    assert existing_cli_path("   ") is None
    assert existing_cli_path(tmp_path) is None

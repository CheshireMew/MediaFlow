import json
import threading

import pytest

from backend.contracts import ASR_EXECUTION_PREFERENCES
from backend.services.settings_manager import (
    LLMProvider,
    SMART_SPLIT_TEXT_LIMIT_DEFAULT,
    SettingsManager,
    UiStatePatch,
    UserPreferencesPatch,
    UserSettings,
)


def test_settings_manager_defaults_auto_execute_flow_disabled():
    settings = UserSettings()

    assert settings.auto_execute_flow is False


def test_settings_manager_defaults_auto_trim_silence_disabled():
    settings = UserSettings()

    assert settings.auto_trim_silence is False


def test_settings_manager_defaults_smart_split_threshold():
    settings = UserSettings()

    assert settings.smart_split_text_limit == SMART_SPLIT_TEXT_LIMIT_DEFAULT


def test_settings_manager_normalizes_active_provider_selection():
    settings = UserSettings(
        llm_providers=[
            LLMProvider(
                id="a",
                name="A",
                base_url="https://example.com/v1",
                api_key="key-a",
                model="model-a",
                is_active=False,
            ),
            LLMProvider(
                id="b",
                name="B",
                base_url="https://example.com/v1",
                api_key="key-b",
                model="model-b",
                is_active=False,
            ),
        ]
    )

    normalized = SettingsManager._normalize_settings(settings)

    assert normalized.llm_providers[0].is_active is True
    assert normalized.llm_providers[1].is_active is False


def test_settings_manager_reads_current_file_on_each_get(tmp_path, monkeypatch):
    settings_path = tmp_path / "user_settings.json"
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    manager = SettingsManager()

    first = manager.get_settings()
    assert first.language == "zh"

    settings_path.write_text('{"language":"ja","llm_providers":[]}', encoding="utf-8")

    second = manager.get_settings()
    assert second.language == "ja"


def test_settings_manager_atomic_save_keeps_previous_file_on_write_failure(tmp_path, monkeypatch):
    settings_path = tmp_path / "user_settings.json"
    settings_path.write_text('{"language":"en","llm_providers":[]}', encoding="utf-8")
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    manager = SettingsManager()

    def failing_dump(_data, file_obj, **_kwargs):
        file_obj.write('{"language":')
        raise RuntimeError("simulated partial write")

    monkeypatch.setattr("backend.services.settings_manager.json.dump", failing_dump)

    with pytest.raises(RuntimeError, match="simulated partial write"):
        manager._write_atomic(UserSettings(language="ja"))

    assert json.loads(settings_path.read_text(encoding="utf-8"))["language"] == "en"
    assert list(tmp_path.glob("*.tmp")) == []


def test_settings_manager_raises_on_invalid_settings_file(tmp_path, monkeypatch):
    settings_path = tmp_path / "user_settings.json"
    settings_path.write_text('{"language":', encoding="utf-8")
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    manager = SettingsManager()

    with pytest.raises(RuntimeError, match="Failed to load settings"):
        manager.get_settings()


def test_settings_manager_reads_asr_execution_preferences():
    manager = object.__new__(SettingsManager)
    settings = UserSettings(
        ui_state={
            ASR_EXECUTION_PREFERENCES["key"]: json.dumps(
                {
                    "schema_version": ASR_EXECUTION_PREFERENCES["schema_version"],
                    "payload": {
                        "engine": "cli",
                        "model": "large-v3",
                        "device": "cuda",
                    },
                }
            )
        }
    )

    preferences = manager.get_asr_execution_preferences(settings)

    assert preferences.engine == "cli"
    assert preferences.model == "large-v3"
    assert preferences.device == "cuda"


def test_settings_manager_marks_encrypted_api_keys(monkeypatch):
    manager = object.__new__(SettingsManager)
    user_settings = UserSettings(
        llm_providers=[
            LLMProvider(
                id="a",
                name="A",
                base_url="https://example.com/v1",
                api_key="secret",
                model="model-a",
                is_active=True,
            )
        ]
    )

    monkeypatch.setattr(
        "backend.utils.security.SecurityManager.encrypt",
        lambda text: f"enc:{text}",
    )

    data = manager._serialize_settings_data(user_settings)

    assert data["llm_providers"][0]["api_key"] == "enc:secret"
    assert data["llm_providers"][0]["api_key_encrypted"] is True


def test_settings_manager_marks_plaintext_fallback_api_keys(monkeypatch):
    manager = object.__new__(SettingsManager)
    user_settings = UserSettings(
        llm_providers=[
            LLMProvider(
                id="a",
                name="A",
                base_url="https://example.com/v1",
                api_key="secret",
                model="model-a",
                is_active=True,
            )
        ]
    )

    monkeypatch.setattr(
        "backend.utils.security.SecurityManager.encrypt",
        lambda text: text,
    )

    data = manager._serialize_settings_data(user_settings)

    assert data["llm_providers"][0]["api_key"] == "secret"
    assert data["llm_providers"][0]["api_key_encrypted"] is False


def test_settings_manager_reads_plaintext_fallback_api_keys():
    data = {
        "llm_providers": [
            {
                "id": "a",
                "name": "A",
                "base_url": "https://example.com/v1",
                "api_key": "secret",
                "api_key_encrypted": False,
                "model": "model-a",
                "is_active": True,
            }
        ]
    }

    restored = SettingsManager._deserialize_settings_data(data)

    assert restored["llm_providers"][0]["api_key"] == "secret"
    assert "api_key_encrypted" not in restored["llm_providers"][0]


def test_preference_and_ui_state_patches_merge_latest_disk_state_atomically(
    tmp_path,
    monkeypatch,
):
    settings_path = tmp_path / "user_settings.json"
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    first_manager = SettingsManager()
    second_manager = SettingsManager()
    first_manager.patch_ui_state(UiStatePatch(updates={"editor": {"zoom": 1.0}}))

    barrier = threading.Barrier(2)

    def patch_preferences():
        barrier.wait()
        first_manager.patch_preferences(
            UserPreferencesPatch(language="ja", auto_execute_flow=True)
        )

    def patch_ui_state():
        barrier.wait()
        second_manager.patch_ui_state(
            UiStatePatch(
                updates={"translator": {"target": "English"}},
                remove=["editor"],
            )
        )

    threads = [
        threading.Thread(target=patch_preferences),
        threading.Thread(target=patch_ui_state),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
        assert not thread.is_alive()

    saved = first_manager.get_settings()
    assert saved.language == "ja"
    assert saved.auto_execute_flow is True
    assert saved.ui_state == {"translator": {"target": "English"}}


def test_preference_patch_can_explicitly_clear_nullable_path(tmp_path, monkeypatch):
    settings_path = tmp_path / "user_settings.json"
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    manager = SettingsManager()
    manager.patch_preferences(UserPreferencesPatch(default_download_path="D:/Media"))

    manager.patch_preferences(UserPreferencesPatch(default_download_path=None))

    assert manager.get_settings().default_download_path is None


def test_preference_patch_persists_auto_trim_silence(tmp_path, monkeypatch):
    settings_path = tmp_path / "user_settings.json"
    monkeypatch.setattr(SettingsManager, "_file_path", settings_path)
    manager = SettingsManager()

    manager.patch_preferences(UserPreferencesPatch(auto_trim_silence=True))

    assert manager.get_settings().auto_trim_silence is True

import json
import os
import threading
from typing import Any

from loguru import logger

from backend.config import settings
from backend.contracts import ASR_EXECUTION_PREFERENCES
from backend.models.settings_contracts import (
    AsrExecutionPreferences,
    LLMProvider,
    UiStatePatch,
    UserPreferencesPatch,
    UserSettings,
)


class SettingsManager:
    _file_path = settings.USER_DATA_DIR / "user_settings.json"
    _io_lock = threading.RLock()

    def __init__(self):
        self._ensure_settings_file()

    @staticmethod
    def _apply_runtime_settings(user_settings: UserSettings) -> None:
        if user_settings.faster_whisper_cli_path:
            settings.FASTER_WHISPER_CLI_PATH = user_settings.faster_whisper_cli_path

    @staticmethod
    def _normalize_settings(user_settings: UserSettings) -> UserSettings:
        if user_settings.llm_providers:
            active_indices = [
                index
                for index, provider in enumerate(user_settings.llm_providers)
                if provider.is_active
            ]
            if not active_indices:
                user_settings.llm_providers[0].is_active = True
            elif len(active_indices) > 1:
                first_active = active_indices[0]
                for index, provider in enumerate(user_settings.llm_providers):
                    provider.is_active = index == first_active
        return user_settings

    def _ensure_settings_file(self) -> None:
        with self._io_lock:
            if self._file_path.exists():
                return

            self._write_atomic(
                UserSettings(
                    faster_whisper_cli_path=settings.FASTER_WHISPER_CLI_PATH or None,
                )
            )

    def _load(self) -> UserSettings:
        with self._io_lock:
            self._ensure_settings_file()
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    data = self._deserialize_settings_data(data)
                    data.setdefault(
                        "faster_whisper_cli_path",
                        settings.FASTER_WHISPER_CLI_PATH or None,
                    )

                    loaded_settings = self._normalize_settings(UserSettings(**data))
                    self._apply_runtime_settings(loaded_settings)
                logger.info(f"Loaded settings from {self._file_path}")
                return loaded_settings
            except Exception as e:
                logger.error(f"Failed to load settings from {self._file_path}: {e}")
                raise RuntimeError(
                    f"Failed to load settings from {self._file_path}: {e}"
                ) from e

    def _write_atomic(self, user_settings: UserSettings) -> None:
        with self._io_lock:
            self._file_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = self._file_path.with_name(
                f".{self._file_path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
            )
            try:
                data = self._serialize_settings_data(user_settings)

                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.write("\n")
                    f.flush()
                    os.fsync(f.fileno())

                os.replace(temp_path, self._file_path)
            except Exception as e:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass
                logger.error(f"Failed to save settings to {self._file_path}: {e}")
                raise

    def _serialize_settings_data(self, user_settings: UserSettings) -> dict:
        from backend.utils.security import SecurityManager

        data = user_settings.model_dump(mode="json")

        for provider in data.get("llm_providers", []):
            api_key = provider.get("api_key")
            if not api_key:
                provider["api_key_encrypted"] = False
                continue

            encrypted = SecurityManager.encrypt(api_key)
            provider["api_key"] = encrypted
            provider["api_key_encrypted"] = encrypted != api_key

        return data

    @staticmethod
    def _deserialize_settings_data(data: dict) -> dict:
        from backend.utils.security import SecurityManager

        for provider in data.get("llm_providers", []):
            api_key = provider.get("api_key")
            encrypted_flag = provider.get("api_key_encrypted")
            if not api_key:
                provider.pop("api_key_encrypted", None)
                continue

            if encrypted_flag is False:
                provider.pop("api_key_encrypted", None)
                continue

            provider["api_key"] = SecurityManager.decrypt(api_key)
            provider.pop("api_key_encrypted", None)

        return data

    def get_settings(self) -> UserSettings:
        return self._load()

    def get_asr_execution_preferences(
        self,
        user_settings: UserSettings | None = None,
    ) -> AsrExecutionPreferences:
        settings_source = user_settings or self.get_settings()
        raw_preferences = settings_source.ui_state.get(ASR_EXECUTION_PREFERENCES["key"])
        if not isinstance(raw_preferences, str):
            return AsrExecutionPreferences()

        try:
            envelope = json.loads(raw_preferences)
        except json.JSONDecodeError:
            return AsrExecutionPreferences()

        if (
            not isinstance(envelope, dict)
            or envelope.get("schema_version") != ASR_EXECUTION_PREFERENCES["schema_version"]
        ):
            return AsrExecutionPreferences()

        payload = envelope.get("payload")
        if not isinstance(payload, dict):
            return AsrExecutionPreferences()

        return AsrExecutionPreferences(
            engine="cli"
            if payload.get("engine") == "cli"
            else ASR_EXECUTION_PREFERENCES["defaults"]["engine"],
            model=payload.get("model")
            if isinstance(payload.get("model"), str) and payload.get("model")
            else ASR_EXECUTION_PREFERENCES["defaults"]["model"],
            device=payload.get("device")
            if isinstance(payload.get("device"), str) and payload.get("device")
            else ASR_EXECUTION_PREFERENCES["defaults"]["device"],
        )

    def patch_preferences(
        self,
        patch: UserPreferencesPatch | dict[str, Any],
    ) -> UserSettings:
        typed_patch = UserPreferencesPatch.model_validate(patch)
        updates = typed_patch.model_dump(exclude_unset=True)
        with self._io_lock:
            current = self._load()
            data = current.model_dump()
            data.update(updates)
            normalized_settings = self._normalize_settings(UserSettings.model_validate(data))
            self._apply_runtime_settings(normalized_settings)
            self._write_atomic(normalized_settings)
        logger.info("User preferences patched and saved.")
        return normalized_settings

    def patch_ui_state(
        self,
        patch: UiStatePatch | dict[str, Any],
    ) -> UserSettings:
        typed_patch = UiStatePatch.model_validate(patch)
        if any(not key for key in [*typed_patch.updates, *typed_patch.remove]):
            raise ValueError("UI state keys must not be empty")
        with self._io_lock:
            current = self._load()
            next_ui_state = dict(current.ui_state)
            next_ui_state.update(typed_patch.updates)
            for key in typed_patch.remove:
                next_ui_state.pop(key, None)
            normalized_settings = self._normalize_settings(
                UserSettings.model_validate(
                    {**current.model_dump(), "ui_state": next_ui_state}
                )
            )
            self._write_atomic(normalized_settings)
        logger.info(
            "UI state patched and saved: updated={} removed={}",
            len(typed_patch.updates),
            len(typed_patch.remove),
        )
        return normalized_settings

    def get_active_llm_provider(self) -> LLMProvider | None:
        for provider in self.get_settings().llm_providers:
            if provider.is_active:
                return provider
        return None

    def set_active_provider(self, provider_id: str):
        with self._io_lock:
            current_settings = self._load()
            found = False
            for provider in current_settings.llm_providers:
                if provider.id == provider_id:
                    provider.is_active = True
                    found = True
                else:
                    provider.is_active = False

            if not found:
                raise ValueError(f"Provider {provider_id} not found")
            self._write_atomic(current_settings)

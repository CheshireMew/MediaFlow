import json
from typing import Any, List, Optional

from loguru import logger
from pydantic import BaseModel, Field

from backend.config import settings


class LLMProvider(BaseModel):
    id: str = Field(..., description="Unique Identifier")
    name: str = Field(..., description="Display Name")
    base_url: str
    api_key: str
    model: str
    is_active: bool = False


SMART_SPLIT_TEXT_LIMIT_DEFAULT = 24


class UserSettings(BaseModel):
    llm_providers: List[LLMProvider] = []
    default_download_path: Optional[str] = None
    faster_whisper_cli_path: Optional[str] = None
    language: str = "zh"
    auto_execute_flow: bool = False
    smart_split_text_limit: int = Field(
        default=SMART_SPLIT_TEXT_LIMIT_DEFAULT,
        ge=1,
    )
    ui_state: dict[str, Any] = Field(default_factory=dict)


class SettingsManager:
    _file_path = settings.USER_DATA_DIR / "user_settings.json"

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
        if self._file_path.exists():
            return

        self.save(
            UserSettings(
                faster_whisper_cli_path=settings.FASTER_WHISPER_CLI_PATH or None,
            )
        )

    def _load(self) -> UserSettings:
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
            logger.error(f"Failed to load settings: {e}")
            return UserSettings()

    def save(self, user_settings: UserSettings) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = self._serialize_settings_data(user_settings)

            with open(self._file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def _serialize_settings_data(self, user_settings: UserSettings) -> dict:
        from backend.utils.security import SecurityManager

        if hasattr(user_settings, "model_dump"):
            data = user_settings.model_dump()
        else:
            data = user_settings.dict()

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

    def update_settings(self, new_settings: UserSettings):
        normalized_settings = self._normalize_settings(new_settings)
        self._apply_runtime_settings(normalized_settings)
        self.save(normalized_settings)
        logger.info("Settings updated and saved.")

    def get_active_llm_provider(self) -> Optional[LLMProvider]:
        for provider in self.get_settings().llm_providers:
            if provider.is_active:
                return provider
        return None

    def set_active_provider(self, provider_id: str):
        current_settings = self.get_settings()
        found = False
        for provider in current_settings.llm_providers:
            if provider.id == provider_id:
                provider.is_active = True
                found = True
            else:
                provider.is_active = False

        if found:
            self.save(current_settings)
        else:
            raise ValueError(f"Provider {provider_id} not found")

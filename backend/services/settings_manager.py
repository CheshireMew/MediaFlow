
import json
import shutil
from pathlib import Path
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from loguru import logger
from backend.config import settings

class LLMProvider(BaseModel):
    id: str = Field(..., description="Unique Identifier")
    name: str = Field(..., description="Display Name")
    base_url: str
    api_key: str
    model: str
    is_active: bool = False

class UserSettings(BaseModel):
    llm_providers: List[LLMProvider] = []
    default_download_path: Optional[str] = None
    language: str = "zh"
    translation_target_language: str = "Chinese"
    transcription_model: str = "base"
    auto_execute_flow: bool = False

class SettingsManager:
    _instance = None
    _legacy_file_path = settings.BASE_DIR / "data" / "user_settings.json"
    _file_path = settings.USER_DATA_DIR / "user_settings.json"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SettingsManager, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        self._settings = UserSettings()
        self._load()

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

    def _load(self):
        self._migrate_legacy_settings_file()
        if self._file_path.exists():
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    data = self._deserialize_settings_data(data)
                                
                    self._settings = self._normalize_settings(UserSettings(**data))
                logger.info(f"Loaded settings from {self._file_path}")
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
                self._settings = UserSettings()
        else:
            # First run — start with empty defaults, user configures via UI
            self.save()

    def _migrate_legacy_settings_file(self):
        if self._file_path.exists() or not self._legacy_file_path.exists():
            return

        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(str(self._legacy_file_path), str(self._file_path))
            logger.info(
                f"Migrated legacy settings file from {self._legacy_file_path} to {self._file_path}"
            )
        except Exception as e:
            logger.warning(
                f"Failed to migrate legacy settings file from {self._legacy_file_path} to {self._file_path}: {e}"
            )


    def save(self):
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = self._serialize_settings_data()
            
            with open(self._file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def _serialize_settings_data(self) -> dict:
        from backend.utils.security import SecurityManager

        if hasattr(self._settings, "model_dump"):
            data = self._settings.model_dump()
        else:
            data = self._settings.dict()

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
        return self._settings

    def update_settings(self, new_settings: UserSettings):
        self._settings = self._normalize_settings(new_settings)
        self.save()
        logger.info("Settings updated and saved.")

    def get_active_llm_provider(self) -> Optional[LLMProvider]:
        for p in self._settings.llm_providers:
            if p.is_active:
                return p
        return None
    
    def set_active_provider(self, provider_id: str):
        found = False
        for p in self._settings.llm_providers:
            if p.id == provider_id:
                p.is_active = True
                found = True
            else:
                p.is_active = False
        
        if found:
            self.save()
        else:
            raise ValueError(f"Provider {provider_id} not found")



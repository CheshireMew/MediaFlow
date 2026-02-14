
import json
import os
from pathlib import Path
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from loguru import logger
from src.config import settings

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
    auto_execute_flow: bool = False

class SettingsManager:
    _instance = None
    _file_path = settings.BASE_DIR / "data" / "user_settings.json"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SettingsManager, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        self._settings = UserSettings()
        self._load()

    def _load(self):
        if self._file_path.exists():
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Decrypt keys before loading into model
                    from src.utils.security import SecurityManager
                    if "llm_providers" in data:
                        for p in data["llm_providers"]:
                            if "api_key" in p and p["api_key"]:
                                # Try to decrypt; if fails, SecurityManager returns input (e.g. migration case)
                                # Unless it looks like plaintext (migration scenario)
                                decrypted = SecurityManager.decrypt(p["api_key"])
                                p["api_key"] = decrypted
                                
                    self._settings = UserSettings(**data)
                logger.info(f"Loaded settings from {self._file_path}")
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
                self._migrate_from_env()
        else:
            self._migrate_from_env()
            self.save()

    def _migrate_from_env(self):
        """One-time migration from .env to json settings if json is missing."""
        logger.info("Migrating settings from .env...")
        api_key = settings.LLM_API_KEY
        base_url = settings.LLM_BASE_URL
        model = settings.LLM_MODEL
        
        if api_key:
            provider = LLMProvider(
                id="default_env",
                name="Default (env)",
                base_url=base_url,
                api_key=api_key, # Initial load is plaintext in memory
                model=model,
                is_active=True
            )
            self._settings.llm_providers.append(provider)

    def save(self):
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            # Encrypt sensitive data before saving
            from src.utils.security import SecurityManager
            
            # Dump to dict first
            if hasattr(self._settings, 'model_dump'):
                data = self._settings.model_dump()
            else:
                data = self._settings.dict()
            
            # Encrypt API Keys in the dictionary copy
            for p in data.get("llm_providers", []):
                if p.get("api_key"):
                    p["api_key"] = SecurityManager.encrypt(p["api_key"])
            
            with open(self._file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def get_settings(self) -> UserSettings:
        return self._settings

    def update_settings(self, new_settings: UserSettings):
        self._settings = new_settings
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



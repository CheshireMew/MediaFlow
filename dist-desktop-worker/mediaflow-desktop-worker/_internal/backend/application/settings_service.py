import subprocess
import sys
from importlib import import_module
from typing import Optional

from openai import OpenAI

from backend.core.runtime_access import RuntimeServices
from backend.services.settings_manager import LLMProvider, UserSettings


class SettingsApplicationService:
    def __init__(self, settings_manager):
        self._settings_manager = settings_manager

    def get_settings(self) -> UserSettings:
        return self._settings_manager.get_settings()

    def update_settings(self, settings: UserSettings) -> UserSettings:
        self._settings_manager.update_settings(settings)
        return self._settings_manager.get_settings()

    def set_active_provider(self, provider_id: str) -> dict[str, str]:
        self._settings_manager.set_active_provider(provider_id)
        return {"status": "success", "active_provider_id": provider_id}

    def test_provider_connection(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        name: str | None = None,
    ) -> dict[str, str]:
        if not base_url.strip():
            raise ValueError("Base URL is required")
        if not api_key.strip():
            raise ValueError("API key is required")
        if not model.strip():
            raise ValueError("Model is required")

        provider = LLMProvider(
            id="test-provider",
            name=name or "Test Provider",
            base_url=base_url,
            api_key=api_key,
            model=model,
            is_active=False,
        )
        client = OpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url,
            timeout=15.0,
        )
        client.chat.completions.create(
            model=provider.model,
            messages=[{"role": "user", "content": "Reply with OK."}],
            max_tokens=3,
        )
        return {"status": "success", "message": "Connection successful"}

    def update_yt_dlp(self) -> dict[str, str | None]:
        previous_version = self.get_yt_dlp_version()
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "Unknown pip error").strip()
            raise RuntimeError(detail)

        return {
            "status": "success",
            "message": "yt-dlp update completed. Restart the backend if the new version is not picked up immediately.",
            "previous_version": previous_version,
            "current_version": self.get_yt_dlp_version(),
        }

    @staticmethod
    def get_yt_dlp_version() -> Optional[str]:
        try:
            yt_dlp = import_module("yt_dlp")
            version = getattr(getattr(yt_dlp, "version", None), "__version__", None)
            if version:
                return str(version)
        except Exception:
            return None
        return None

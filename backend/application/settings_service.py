from backend.models.settings_contracts import (
    CudaReadinessResponse,
    LLMProvider,
    UiStatePatch,
    UserPreferencesPatch,
    UserSettings,
)
from backend.services.llm_io_logger import log_llm_messages, log_llm_response
from backend.services.runtime_diagnostics import RuntimeDiagnosticsService
from backend.services.runtime_tool_installer import RuntimeToolInstaller

OpenAI = None


class SettingsApplicationService:
    def __init__(self, settings_manager):
        self._settings_manager = settings_manager
        self._tool_installer = RuntimeToolInstaller(settings_manager)

    def get_settings(self) -> UserSettings:
        return self._settings_manager.get_settings()

    def get_cuda_readiness(self) -> CudaReadinessResponse:
        return RuntimeDiagnosticsService().cuda_readiness()

    def patch_preferences(self, patch: UserPreferencesPatch) -> UserSettings:
        return self._settings_manager.patch_preferences(patch)

    def patch_ui_state(self, patch: UiStatePatch) -> UserSettings:
        return self._settings_manager.patch_ui_state(patch)

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
        client_factory = OpenAI
        if client_factory is None:
            from openai import OpenAI as imported_openai

            globals()["OpenAI"] = imported_openai
            client_factory = imported_openai

        provider = LLMProvider(
            id="test-provider",
            name=name or "Test Provider",
            base_url=base_url,
            api_key=api_key,
            model=model,
            is_active=False,
        )
        client = client_factory(
            api_key=provider.api_key,
            base_url=provider.base_url,
            timeout=15.0,
        )
        messages = [{"role": "user", "content": "Reply with OK."}]
        log_llm_messages("Provider connection test", messages)
        response = client.chat.completions.create(
            model=provider.model,
            messages=messages,
            max_tokens=3,
        )
        log_llm_response("Provider connection test", response)
        return {"status": "success", "message": "Connection successful"}

    def update_yt_dlp(self) -> dict[str, str | None]:
        return self._tool_installer.update_yt_dlp()

    def install_faster_whisper_cli(self) -> dict[str, str | None]:
        return self._tool_installer.install_faster_whisper_cli()

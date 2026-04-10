from backend.api.v1.settings import ProviderConnectionRequest
from backend.application.settings_service import SettingsApplicationService


def test_test_provider_connection_requires_fields():
    service = SettingsApplicationService(object())
    try:
        request = ProviderConnectionRequest(base_url="", api_key="key", model="gpt-4o")
        service.test_provider_connection(
            name=request.name,
            base_url=request.base_url,
            api_key=request.api_key,
            model=request.model,
        )
    except ValueError as exc:
        assert "Base URL is required" in str(exc)
    else:
        raise AssertionError("Expected ValueError for empty base URL")


def test_test_provider_connection_uses_openai_client(monkeypatch):
    service = SettingsApplicationService(object())
    calls = {}

    class FakeCompletions:
        def create(self, **kwargs):
            calls["kwargs"] = kwargs
            return {"id": "ok"}

    class FakeChat:
        def __init__(self):
            self.completions = FakeCompletions()

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client_kwargs"] = kwargs
            self.chat = FakeChat()

    monkeypatch.setattr("backend.application.settings_service.OpenAI", FakeClient)

    request = ProviderConnectionRequest(
        name="Test",
        base_url="https://api.example.com/v1",
        api_key="secret",
        model="gpt-test",
    )
    service.test_provider_connection(
        name=request.name,
        base_url=request.base_url,
        api_key=request.api_key,
        model=request.model,
    )

    assert calls["client_kwargs"]["base_url"] == "https://api.example.com/v1"
    assert calls["client_kwargs"]["api_key"] == "secret"
    assert calls["kwargs"]["model"] == "gpt-test"
    assert calls["kwargs"]["max_tokens"] == 3

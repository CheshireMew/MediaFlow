from backend.api.v1.settings import ProviderConnectionRequest, _test_provider_connection


def test_test_provider_connection_requires_fields():
    try:
        _test_provider_connection(
            ProviderConnectionRequest(base_url="", api_key="key", model="gpt-4o")
        )
    except ValueError as exc:
        assert "Base URL is required" in str(exc)
    else:
        raise AssertionError("Expected ValueError for empty base URL")


def test_test_provider_connection_uses_openai_client(monkeypatch):
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

    monkeypatch.setattr("backend.api.v1.settings.OpenAI", FakeClient)

    _test_provider_connection(
        ProviderConnectionRequest(
            name="Test",
            base_url="https://api.example.com/v1",
            api_key="secret",
            model="gpt-test",
        )
    )

    assert calls["client_kwargs"]["base_url"] == "https://api.example.com/v1"
    assert calls["client_kwargs"]["api_key"] == "secret"
    assert calls["kwargs"]["model"] == "gpt-test"
    assert calls["kwargs"]["max_tokens"] == 3

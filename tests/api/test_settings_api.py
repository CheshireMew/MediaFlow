from backend.api.v1.settings import ProviderConnectionRequest
from backend.application.settings_service import SettingsApplicationService
from backend.services.runtime_diagnostics import CudaReadinessResponse, RuntimeDependencyCheck


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


def test_cuda_readiness_endpoint(client, monkeypatch):
    readiness = CudaReadinessResponse(
        status="ready",
        summary="CUDA is ready.",
        gpu_name="GPU",
        driver_version="595.79",
        driver_cuda_capability="13.2",
        dependencies=[
            RuntimeDependencyCheck(
                key="cublas",
                label="cuBLAS",
                status="ready",
                detail="ok",
            )
        ],
        install_guidance=["CUDA is ready."],
    )
    monkeypatch.setattr(
        SettingsApplicationService,
        "get_cuda_readiness",
        lambda _self: readiness,
    )

    response = client.get("/api/v1/settings/cuda-readiness")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_settings_writes_use_explicit_patch_endpoints(isolated_api_client):
    preference_response = isolated_api_client.patch(
        "/api/v1/settings/preferences",
        json={
            "language": "ja",
            "auto_execute_flow": True,
            "auto_trim_silence": True,
        },
    )
    assert preference_response.status_code == 200
    assert preference_response.json()["language"] == "ja"
    assert preference_response.json()["auto_trim_silence"] is True

    ui_state_response = isolated_api_client.patch(
        "/api/v1/settings/ui-state",
        json={"updates": {"editor": {"zoom": 1.25}}},
    )
    assert ui_state_response.status_code == 200
    assert ui_state_response.json()["language"] == "ja"
    assert ui_state_response.json()["ui_state"]["editor"] == {"zoom": 1.25}

    full_replace_response = isolated_api_client.post(
        "/api/v1/settings/",
        json={"language": "zh"},
    )
    assert full_replace_response.status_code == 405

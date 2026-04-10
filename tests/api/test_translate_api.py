from backend.application.translation_service import (
    get_language_suffix,
    get_translation_output_suffix,
)
from backend.main import app
from fastapi.testclient import TestClient


def test_get_language_suffix_uses_frontend_compatible_codes():
    assert get_language_suffix("Chinese") == "_CN"
    assert get_language_suffix("English") == "_EN"
    assert get_language_suffix("Japanese") == "_JP"
    assert get_language_suffix("Spanish") == "_ES"
    assert get_language_suffix("French") == "_FR"


def test_get_language_suffix_falls_back_to_language_name_for_unknown_values():
    assert get_language_suffix("Italian") == "_Italian"


def test_get_translation_output_suffix_uses_proofread_suffix():
    assert get_translation_output_suffix("Chinese", "proofread") == "_PR"
    assert get_translation_output_suffix("Japanese", "standard") == "_JP"


def test_translate_endpoint_returns_400_for_client_value_errors(monkeypatch):
    client = TestClient(app)

    async def fake_submit_translation_task(_req):
        raise ValueError("bad translation request")

    monkeypatch.setattr(
        "backend.api.v1.translate.submit_translation_task",
        fake_submit_translation_task,
    )

    response = client.post(
        "/api/v1/translate/",
        json={
            "segments": [],
            "target_language": "Chinese",
            "mode": "standard",
            "context_path": "E:/subs/demo.srt",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "bad translation request"

import pytest

from backend.application.translation_service import (
    get_language_suffix,
    get_translation_output_suffix,
)
from backend.main import app
from fastapi.testclient import TestClient


def test_get_language_suffix_uses_frontend_compatible_codes():
    assert get_language_suffix("SimplifiedChinese") == "_ZH-CN"
    assert get_language_suffix("TraditionalChinese") == "_ZH-TW"
    assert get_language_suffix("English") == "_EN"
    assert get_language_suffix("Japanese") == "_JP"
    assert get_language_suffix("Spanish") == "_ES"
    assert get_language_suffix("French") == "_FR"


def test_get_language_suffix_rejects_unknown_values():
    with pytest.raises(ValueError, match="Unsupported translation target language"):
        get_language_suffix("Italian")


def test_get_translation_output_suffix_uses_proofread_suffix():
    assert get_translation_output_suffix("SimplifiedChinese", "proofread") == "_PR"
    assert get_translation_output_suffix("Japanese", "standard") == "_JP"


def test_retired_background_translate_endpoint_does_not_exist():
    client = TestClient(app)

    response = client.post(
        "/api/v1/translate/",
        json={
            "segments": [],
            "target_language": "SimplifiedChinese",
            "mode": "standard",
        },
    )

    assert response.status_code == 404

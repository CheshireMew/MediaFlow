from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.main import app


def test_update_yt_dlp_endpoint():
    client = TestClient(app)

    class FakeSettingsService:
        def update_yt_dlp(self):
            return {
                "status": "success",
                "message": "yt-dlp update completed.",
                "previous_version": "2025.01.01",
                "current_version": "2025.02.01",
            }

    with patch(
        "backend.api.v1.settings._settings_application",
        return_value=FakeSettingsService(),
    ):
        response = client.post("/api/v1/settings/update-yt-dlp")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["previous_version"] == "2025.01.01"
    assert payload["current_version"] == "2025.02.01"

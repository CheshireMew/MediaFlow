from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from backend.main import app


def test_update_yt_dlp_endpoint():
    client = TestClient(app)

    completed = MagicMock(returncode=0, stdout="ok", stderr="")

    with patch("backend.api.v1.settings.subprocess.run", return_value=completed), patch(
        "backend.api.v1.settings._get_yt_dlp_version",
        side_effect=["2025.01.01", "2025.02.01"],
    ):
        response = client.post("/api/v1/settings/update-yt-dlp")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["previous_version"] == "2025.01.01"
    assert payload["current_version"] == "2025.02.01"

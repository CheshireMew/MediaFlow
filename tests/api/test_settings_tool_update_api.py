from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.core.container import ServiceContainer
from backend.main import create_app
from backend.runtime.backend_bootstrap import BackendBootstrap


def test_update_yt_dlp_endpoint():
    app = create_app(
        runtime_container=ServiceContainer(),
        bootstrap=BackendBootstrap(),
    )
    client = TestClient(app)

    with patch(
        "backend.application.settings_service.SettingsApplicationService.update_yt_dlp",
        return_value={
            "status": "success",
            "message": "yt-dlp update completed.",
            "previous_version": "2025.01.01",
            "current_version": "2025.02.01",
        },
    ):
        response = client.post("/api/v1/settings/update-yt-dlp")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["previous_version"] == "2025.01.01"
    assert payload["current_version"] == "2025.02.01"

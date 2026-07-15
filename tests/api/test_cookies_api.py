from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.runtime.backend_bootstrap import _create_fastapi_app


class FakeDownloadApplication:
    def __init__(self) -> None:
        self.saved: tuple[str, list[dict]] | None = None

    def save_cookies(self, domain: str, cookies: list[dict]) -> None:
        self.saved = (domain, cookies)

    def cookie_status(self, domain: str) -> dict[str, str | bool]:
        return {
            "domain": domain,
            "has_valid_cookies": self.saved is not None,
            "cookie_path": f"D:/cookies/{domain}.txt",
        }

    def clear_cookies(self, domain: str) -> bool:
        return True


def test_bootstrapped_api_registers_cookie_save_and_status_routes():
    download = FakeDownloadApplication()
    dependencies = SimpleNamespace(
        download=download,
        transcription=MagicMock(),
        translation=MagicMock(),
        websocket_notifier=MagicMock(),
        task_manager=MagicMock(),
        task_orchestrator=MagicMock(),
        settings=MagicMock(),
        glossary=MagicMock(),
        highlight=MagicMock(),
        asr_service=MagicMock(),
    )
    api_app, _router_count = _create_fastapi_app(dependencies)

    with TestClient(api_app) as client:
        save_response = client.post(
            "/api/v1/cookies/save",
            json={
                "domain": "example.com",
                "cookies": [{"name": "session", "value": "redacted"}],
            },
        )
        status_response = client.get("/api/v1/cookies/status/example.com")

    assert save_response.status_code == 200
    assert download.saved == (
        "example.com",
        [{"name": "session", "value": "redacted"}],
    )
    assert status_response.status_code == 200
    assert status_response.json() == {
        "domain": "example.com",
        "has_valid_cookies": True,
        "cookie_path": "D:/cookies/example.com.txt",
    }

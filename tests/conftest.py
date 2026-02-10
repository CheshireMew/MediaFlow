import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.core.container import container, Services
from unittest.mock import MagicMock

@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)

@pytest.fixture
def mock_asr():
    """Mock for ASRService."""
    mock = MagicMock()
    container.override(Services.ASR, mock)
    yield mock
    container.reset()

@pytest.fixture
def mock_downloader():
    """Mock for DownloaderService."""
    mock = MagicMock()
    container.override(Services.DOWNLOADER, mock)
    yield mock
    container.reset()

@pytest.fixture
def mock_llm():
    """Mock for LLMTranslator."""
    mock = MagicMock()
    container.override(Services.LLM_TRANSLATOR, mock)
    yield mock
    container.reset()

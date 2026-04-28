import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.container import container, Services
from unittest.mock import MagicMock
from pathlib import Path
import shutil
import uuid

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

@pytest.fixture
def tmp_path():
    """Workspace-local temp path to avoid host TMP permission issues."""
    path = Path(__file__).resolve().parent.parent / ".temp" / "pytest" / str(uuid.uuid4())
    path.mkdir(parents=True, exist_ok=True)
    yield path
    shutil.rmtree(path, ignore_errors=True)

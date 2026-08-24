import shutil
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.core.container import ServiceContainer, Services
from backend.main import create_app
from backend.runtime.backend_bootstrap import BackendBootstrap


@pytest.fixture
def runtime_container():
    return ServiceContainer()

@pytest.fixture
def client(runtime_container):
    """FastAPI test client fixture."""
    app = create_app(
        runtime_container=runtime_container,
        bootstrap=BackendBootstrap(),
    )
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def mock_asr(runtime_container):
    """Mock for ASRService."""
    mock = MagicMock()
    runtime_container.override(Services.ASR, mock)
    yield mock

@pytest.fixture
def mock_downloader(runtime_container):
    """Mock for DownloaderService."""
    mock = MagicMock()
    runtime_container.override(Services.DOWNLOADER, mock)
    yield mock

@pytest.fixture
def mock_llm(runtime_container):
    """Mock for LLMTranslator."""
    mock = MagicMock()
    runtime_container.override(Services.LLM_TRANSLATOR, mock)
    yield mock

@pytest.fixture
def tmp_path():
    """Workspace-local temp path to avoid host TMP permission issues."""
    path = Path(__file__).resolve().parent.parent / ".temp" / "pytest" / str(uuid.uuid4())
    path.mkdir(parents=True, exist_ok=True)
    yield path
    shutil.rmtree(path, ignore_errors=True)

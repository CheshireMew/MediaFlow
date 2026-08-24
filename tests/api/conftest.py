import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

import backend.core.database as database_module
from backend.config import settings
from backend.core.container import ServiceContainer
from backend.main import create_app
from backend.runtime.backend_bootstrap import BackendBootstrap
from backend.services.settings_manager import SettingsManager


@pytest.fixture
def isolated_api_client(tmp_path, monkeypatch):
    runtime_root = tmp_path / "api_runtime"
    user_data_dir = runtime_root / "user_data"
    workspace_dir = runtime_root / "workspace"
    temp_dir = runtime_root / ".temp"
    output_dir = runtime_root / "output"

    for path in [user_data_dir, workspace_dir, temp_dir, output_dir]:
        path.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "USER_DATA_DIR", user_data_dir)
    monkeypatch.setattr(settings, "WORKSPACE_DIR", workspace_dir)
    monkeypatch.setattr(settings, "TEMP_DIR", temp_dir)
    monkeypatch.setattr(settings, "OUTPUT_DIR", output_dir)
    settings.init_dirs()

    monkeypatch.setattr(SettingsManager, "_file_path", user_data_dir / "user_settings.json")

    database_url = f"sqlite+aiosqlite:///{user_data_dir / 'mediaflow.db'}"
    engine = create_async_engine(
        database_url,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    async_session_maker = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    monkeypatch.setattr(database_module, "DATABASE_URL", database_url)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    runtime_container = ServiceContainer()
    app = create_app(
        runtime_container=runtime_container,
        bootstrap=BackendBootstrap(),
    )

    with TestClient(app) as client:
        # The desktop bootstrap intentionally becomes ready in the background.
        # API tests that access container services directly must first cross an
        # inner API boundary that starts TaskManager on TestClient's lifespan
        # loop; otherwise a pytest-asyncio loop can accidentally own its worker
        # and hydration tasks while lifespan teardown runs on another loop.
        readiness_response = client.get("/api/v1/tasks/")
        assert readiness_response.status_code == 200
        yield client

    try:
        asyncio.run(engine.dispose())
    except RuntimeError:
        pass

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

import backend.core.database as database_module
from backend.config import settings
from backend.core.container import container
from backend.main import app
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
    monkeypatch.setattr(
        SettingsManager,
        "_legacy_file_path",
        runtime_root / "data" / "user_settings.json",
    )

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

    container.reset()

    with TestClient(app) as client:
        yield client

    container.reset()
    try:
        asyncio.run(engine.dispose())
    except RuntimeError:
        pass

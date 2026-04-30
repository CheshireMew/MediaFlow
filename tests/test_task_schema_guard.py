import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

import backend.core.database as database_module
from backend.core.database import init_db
from backend.models.task_model import Task


@pytest.mark.asyncio
async def test_init_db_replaces_incompatible_task_table(tmp_path, monkeypatch):
    db_path = tmp_path / "mediaflow.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "CREATE TABLE task ("
                    "id VARCHAR PRIMARY KEY, "
                    "type VARCHAR NOT NULL, "
                    "status VARCHAR NOT NULL, "
                    "created_at INTEGER NOT NULL"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO task (id, type, status, created_at) "
                    "VALUES ('old-task', 'download', 'pending', 1)"
                )
            )

        await init_db()

        async with async_session_maker() as session:
            result = await session.execute(select(Task))
            assert result.scalars().all() == []

        async with engine.begin() as conn:
            columns = await conn.run_sync(
                lambda sync_conn: {
                    column["name"]
                    for column in database_module.inspect(sync_conn).get_columns(Task.__tablename__)
                }
            )
        assert "task_source" in columns
        assert "task_contract_version" in columns
        assert "lifecycle" in columns
    finally:
        await engine.dispose()

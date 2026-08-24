from contextlib import asynccontextmanager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from backend.config import settings
from backend.core.task_schema_migrations import (
    _migrate_task_schema,
    _stamp_created_schema_versions,
)

DATABASE_URL = f"sqlite+aiosqlite:///{settings.USER_DATA_DIR}/mediaflow.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False},
    pool_size=5,
    max_overflow=5,
    pool_timeout=30,
)


@event.listens_for(engine.sync_engine, "connect")
def _configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


async_session_maker = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(_migrate_task_schema)
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_stamp_created_schema_versions)


async def shutdown_db():
    await engine.dispose()

@asynccontextmanager
async def get_session_context():
    """Context manager for manual session usage outside of FastAPI dependencies."""
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

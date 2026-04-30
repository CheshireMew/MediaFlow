from typing import AsyncGenerator
from contextlib import asynccontextmanager

from sqlmodel import SQLModel
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import inspect

from backend.config import settings
from backend.models.task_model import Task

# Database URL (SQLite + aiosqlite)
DATABASE_URL = f"sqlite+aiosqlite:///{settings.USER_DATA_DIR}/mediaflow.db"

# Engine
engine = create_async_engine(
    DATABASE_URL, 
    echo=False, 
    future=True,
    connect_args={"check_same_thread": False}, # Required for SQLite + async
    poolclass=NullPool,
)

# Session Factory
async_session_maker = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)


def _reset_task_table_if_contract_mismatch(sync_connection) -> None:
    inspector = inspect(sync_connection)
    if not inspector.has_table(Task.__tablename__):
        return

    current_columns = {column["name"] for column in inspector.get_columns(Task.__tablename__)}
    contract_columns = {column.name for column in Task.__table__.columns}
    if current_columns == contract_columns:
        return

    missing = sorted(contract_columns - current_columns)
    extra = sorted(current_columns - contract_columns)
    logger.warning(
        "Dropping incompatible task table before startup. "
        f"Missing columns: {missing}; extra columns: {extra}."
    )
    Task.__table__.drop(sync_connection, checkfirst=True)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(_reset_task_table_if_contract_mismatch)
        await conn.run_sync(SQLModel.metadata.create_all)


async def shutdown_db():
    await engine.dispose()

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session

@asynccontextmanager
async def get_session_context():
    """Context manager for manual session usage outside of FastAPI dependencies."""
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

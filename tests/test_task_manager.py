import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.task_manager import TaskManager
from backend.models.task_model import Task
import backend.core.database as db_module

# Test DB URL
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
async def test_engine():
    engine = create_async_engine(
        TEST_DB_URL, 
        echo=False, 
        future=True,
        connect_args={"check_same_thread": False}
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        
    yield engine
    
    await engine.dispose()

@pytest.fixture
async def task_manager(test_engine, monkeypatch):
    # Patch the engine in the module
    monkeypatch.setattr(db_module, "engine", test_engine)
    
    # Patch session maker
    test_session_maker = sessionmaker(
        test_engine, 
        class_=AsyncSession, 
        expire_on_commit=False
    )
    monkeypatch.setattr(db_module, "async_session_maker", test_session_maker)
    
    tm = TaskManager()
    await tm.init_async() # Initialize (creates tables on the engine, though we did it above too)
    return tm

@pytest.mark.asyncio
async def test_create_task(task_manager):
    task_id = await task_manager.create_task("test_type", "Initial message")
    assert task_id is not None
    assert task_id in task_manager.tasks
    task = task_manager.tasks[task_id]
    assert task.status == "pending"
    assert task.type == "test_type"
    
    # Verify DB persistence
    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task is not None
        assert db_task.id == task_id

@pytest.mark.asyncio
async def test_update_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    await task_manager.update_task(task_id, status="running", progress=50.0)
    task = task_manager.tasks[task_id]
    assert task.status == "running"
    assert task.progress == 50.0
    
    # Verify DB persistence
    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task.status == "running"
        assert db_task.progress == 50.0

@pytest.mark.asyncio
async def test_cancel_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    await task_manager.cancel_task(task_id)
    task = task_manager.tasks[task_id]
    assert task.cancelled is True
    assert task.status == "cancelled"
    
    # Verify DB
    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task.cancelled is True

@pytest.mark.asyncio
async def test_delete_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    deleted = await task_manager.delete_task(task_id)
    assert deleted is True
    assert task_id not in task_manager.tasks
    
    # Verify DB
    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task is None

@pytest.mark.asyncio
async def test_warm_start_returns_before_background_task_hydration_finishes(
    test_engine,
    monkeypatch,
):
    monkeypatch.setattr(db_module, "engine", test_engine)

    test_session_maker = sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    monkeypatch.setattr(db_module, "async_session_maker", test_session_maker)

    tm = TaskManager()
    load_started = asyncio.Event()
    release_load = asyncio.Event()

    async def slow_load_tasks():
        load_started.set()
        await release_load.wait()
        tm.tasks = {}

    monkeypatch.setattr(tm, "load_tasks", slow_load_tasks)

    await tm.warm_start_async()
    await asyncio.wait_for(load_started.wait(), timeout=1.0)

    assert tm._startup_load_task is not None
    assert not tm._startup_load_task.done()

    release_load.set()
    await asyncio.wait_for(tm._startup_load_task, timeout=1.0)
    await tm.shutdown_async()

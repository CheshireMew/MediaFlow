import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select

import backend.core.database as db_module
from backend.models.task_model import Task
from backend.services.task_control_service import TaskControlService
from backend.services.task_event_publisher import TaskEventPublisher
from backend.services.task_manager import TaskManager
from backend.services.task_queue_view import TaskQueueView
from backend.services.task_repository import TASK_HISTORY_LIMIT, TaskRepository
from backend.services.task_runtime_state import TaskRuntimeState

# Test DB URL
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def create_task_manager() -> TaskManager:
    return TaskManager(
        repository=TaskRepository(),
        event_publisher=TaskEventPublisher(),
        queue_view=TaskQueueView(),
        control_service=TaskControlService(),
        runtime_state=TaskRuntimeState(),
    )


@pytest.fixture
async def test_engine():
    engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest.fixture
async def task_manager(test_engine, monkeypatch):
    monkeypatch.setattr(db_module, "engine", test_engine)

    test_session_maker = sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    monkeypatch.setattr(db_module, "async_session_maker", test_session_maker)

    tm = create_task_manager()
    await tm.init_async()
    return tm


@pytest.mark.asyncio
async def test_create_task(task_manager):
    task_id = await task_manager.create_task("test_type", "Initial message")
    assert task_id is not None
    assert task_id in task_manager.tasks
    task = task_manager.tasks[task_id]
    assert task.status == "pending"
    assert task.type == "test_type"

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

    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task.cancelled is True


@pytest.mark.asyncio
async def test_delete_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    deleted = await task_manager.delete_task(task_id)
    assert deleted is True
    assert task_id not in task_manager.tasks

    async with db_module.get_session_context() as session:
        db_task = await session.get(Task, task_id)
        assert db_task is None


@pytest.mark.asyncio
async def test_completed_task_history_is_trimmed_in_memory_and_database(task_manager, monkeypatch):
    next_timestamp = iter(range(TASK_HISTORY_LIMIT + 3))
    monkeypatch.setattr(
        "backend.services.task_repository.task_timestamp_ms",
        lambda: next(next_timestamp),
    )

    task_ids = []
    for _ in range(TASK_HISTORY_LIMIT + 3):
        task_id = await task_manager.create_task("transcribe")
        task_ids.append(task_id)
        await task_manager.update_task(task_id, status="completed", progress=100.0)

    history_task_ids = {
        task.id for task in task_manager.tasks.values() if task.persistence_scope == "history"
    }
    assert len(history_task_ids) == TASK_HISTORY_LIMIT
    assert task_ids[0] not in history_task_ids
    assert task_ids[1] not in history_task_ids
    assert task_ids[2] not in history_task_ids
    assert task_ids[-1] in history_task_ids

    async with db_module.get_session_context() as session:
        result = await session.execute(select(Task).where(Task.persistence_scope == "history"))
        persisted_history_tasks = result.scalars().all()
        assert len(persisted_history_tasks) == TASK_HISTORY_LIMIT


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

    tm = create_task_manager()
    load_started = asyncio.Event()
    release_load = asyncio.Event()

    async def slow_load_runtime_tasks():
        load_started.set()
        await release_load.wait()
        tm.tasks = {}

    monkeypatch.setattr(tm, "load_runtime_tasks", slow_load_runtime_tasks)

    await tm.warm_start_async()
    await asyncio.wait_for(load_started.wait(), timeout=1.0)

    assert tm._startup_load_task is not None
    assert not tm._startup_load_task.done()

    release_load.set()
    await asyncio.wait_for(tm._startup_load_task, timeout=1.0)
    await tm.shutdown_async()


@pytest.mark.asyncio
async def test_warm_start_blocks_task_creation_until_hydration_finishes(
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

    tm = create_task_manager()
    load_started = asyncio.Event()
    release_load = asyncio.Event()

    async def slow_load_runtime_tasks():
        load_started.set()
        await release_load.wait()
        tm.tasks = {}
        tm._tasks_loaded.set()

    monkeypatch.setattr(tm, "load_runtime_tasks", slow_load_runtime_tasks)

    await tm.warm_start_async()
    await asyncio.wait_for(load_started.wait(), timeout=1.0)

    create_task = asyncio.create_task(tm.create_task("download", "Queued"))
    await asyncio.sleep(0.05)
    assert not create_task.done()

    release_load.set()
    task_id = await asyncio.wait_for(create_task, timeout=1.0)

    assert task_id in tm.tasks
    await tm.shutdown_async()

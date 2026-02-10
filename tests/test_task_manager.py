import pytest
import asyncio
from src.services.task_manager import TaskManager, TaskInfo

@pytest.fixture
def task_manager():
    tm = TaskManager()
    # Mock save to avoid file I/O in tests
    tm.save_tasks = lambda: asyncio.sleep(0)
    return tm

@pytest.mark.asyncio
async def test_create_task(task_manager):
    task_id = await task_manager.create_task("test_type", "Initial message")
    assert task_id is not None
    assert task_id in task_manager.tasks
    task = task_manager.tasks[task_id]
    assert task.status == "pending"
    assert task.type == "test_type"

@pytest.mark.asyncio
async def test_update_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    await task_manager.update_task(task_id, status="running", progress=50.0)
    task = task_manager.tasks[task_id]
    assert task.status == "running"
    assert task.progress == 50.0

@pytest.mark.asyncio
async def test_cancel_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    await task_manager.cancel_task(task_id)
    task = task_manager.tasks[task_id]
    assert task.cancelled is True
    assert task.status == "cancelled"

@pytest.mark.asyncio
async def test_delete_task(task_manager):
    task_id = await task_manager.create_task("test_type")
    deleted = await task_manager.delete_task(task_id)
    assert deleted is True
    assert task_id not in task_manager.tasks

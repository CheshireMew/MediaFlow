import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import select

import backend.core.database as database_module
from backend.config import settings
from backend.contracts import task_lifecycle, task_persistence_scope
from backend.core.database import init_db
from backend.models.application_errors import InvalidInputError, TaskConsistencyError
from backend.models.media_contracts import MediaReference, TaskArtifact, TaskResult
from backend.models.task_model import Task
from backend.services.task_repository import TaskRepository


@pytest.mark.asyncio
async def test_task_repository_rejects_unknown_update_fields():
    with pytest.raises(ValueError, match="Unsupported task update fields: progres"):
        await TaskRepository().update_task("task-id", progres=10)


@pytest.mark.asyncio
async def test_task_repository_rejects_types_outside_the_task_catalog():
    with pytest.raises(ValueError, match="Unknown task type"):
        await TaskRepository().create_task(task_type="retired-operation")


@pytest.mark.asyncio
async def test_task_repository_rejects_unserializable_request_params():
    with pytest.raises(InvalidInputError) as exc_info:
        await TaskRepository().create_task(
            task_type="pipeline",
            request_params={"unsupported": object()},
        )

    assert exc_info.value.code == "invalid_task_request_params"


@pytest.mark.asyncio
async def test_task_repository_does_not_create_memory_only_updates(tmp_path, monkeypatch):
    db_path = tmp_path / "mediaflow.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)
    cached_task = Task(
        id="missing-task",
        name="Missing task",
        type="pipeline",
        status="pending",
        revision=3,
    )

    try:
        await init_db()
        with pytest.raises(TaskConsistencyError) as exc_info:
            await TaskRepository().update_task(
                cached_task.id,
                cached_task=cached_task,
                progress=40,
            )

        assert exc_info.value.code == "task_persistence_mismatch"
        assert cached_task.progress == 0
        assert cached_task.revision == 3
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_task_repository_serializes_pydantic_objects_in_result(tmp_path, monkeypatch):
    db_path = tmp_path / "mediaflow.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    repository = TaskRepository()
    try:
        await init_db()
        task = await repository.create_task(
            task_type="pipeline",
            request_params={
                "pipeline_id": "repository_serialization",
                "steps": [
                    {
                        "step_name": "synthesize",
                        "params": {
                            "video_ref": MediaReference(
                                path="E:/media/input.mp4",
                                name="input.mp4",
                            )
                        },
                    }
                ],
            },
        )

        output_ref = MediaReference(
            path="E:/media/output.mp4",
            name="output.mp4",
            media_kind="video",
            role="output",
        )
        updated = await repository.update_task(
            task.id,
            status="completed",
            result=TaskResult(
                success=True,
                artifacts=[
                    TaskArtifact(kind="video", role="output", ref=output_ref)
                ],
            ),
        )

        assert updated is not None
        assert updated.result["artifacts"][0]["ref"]["path"] == "E:/media/output.mp4"
        assert updated.result["artifacts"][0]["ref"]["name"] == "output.mp4"
        assert updated.request_params["steps"][0]["params"]["video_ref"]["path"] == "E:/media/input.mp4"
        assert len(task.id) == 36
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_task_repository_returns_recent_history_without_mutating_older_records(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)
    history_limit = 5
    monkeypatch.setattr(settings, "TASK_HISTORY_LIMIT", history_limit)

    repository = TaskRepository()
    try:
        await init_db()
        async with database_module.get_session_context() as session:
            for index in range(history_limit + 5):
                session.add(
                    Task(
                        id=f"history-{index:02d}",
                        name=f"History {index}",
                        type="pipeline",
                        status="completed",
                        persistence_scope=task_persistence_scope("completed"),
                        lifecycle=task_lifecycle("completed"),
                        created_at=index,
                    )
                )
            await session.commit()

        history = await repository.load_history_summaries()
        history_ids = {task["id"] for task in history}

        assert len(history) == history_limit
        assert "history-00" not in history_ids
        assert "history-04" not in history_ids
        assert "history-05" in history_ids
        assert "history-09" in history_ids
        assert all("request_params" not in task and "result" not in task for task in history)

        async with database_module.get_session_context() as session:
            result = await session.execute(select(Task).where(Task.status == "completed"))
            remaining_tasks = result.scalars().all()
            assert len(remaining_tasks) == history_limit + 5
    finally:
        await engine.dispose()

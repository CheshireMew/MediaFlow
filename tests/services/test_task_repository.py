import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import select

import backend.core.database as database_module
from backend.config import settings
from backend.core.database import init_db
from backend.contracts import task_lifecycle, task_persistence_scope
from backend.models.task_model import Task
from backend.models.schemas import MediaReference, TaskArtifact, TaskResult
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
            task_type="synthesis",
            request_params={
                "video_ref": MediaReference(path="E:/media/input.mp4", name="input.mp4")
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
        assert updated.request_params["video_ref"]["path"] == "E:/media/input.mp4"
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
                        type="transcribe",
                        status="completed",
                        persistence_scope=task_persistence_scope("completed"),
                        lifecycle=task_lifecycle("completed"),
                        created_at=index,
                    )
                )
            await session.commit()

        history = await repository.load_history()

        assert len(history) == history_limit
        assert "history-00" not in history
        assert "history-04" not in history
        assert "history-05" in history
        assert "history-09" in history

        async with database_module.get_session_context() as session:
            result = await session.execute(select(Task).where(Task.status == "completed"))
            remaining_tasks = result.scalars().all()
            assert len(remaining_tasks) == history_limit + 5
    finally:
        await engine.dispose()

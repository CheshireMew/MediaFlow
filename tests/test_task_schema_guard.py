import json

import pytest
from sqlalchemy import JSON, Boolean, Column, Float, Integer, MetaData, String, Table, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

import backend.core.database as database_module
from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.core.database import (
    SCHEMA_VERSION_TABLE,
    TASK_SCHEMA_COMPONENT,
    TASK_SCHEMA_VERSION,
    init_db,
)
from backend.models.schemas import TaskResult
from backend.models.task_model import Task


def legacy_v2_task_table() -> Table:
    return Table(
        "task",
        MetaData(),
        Column("id", String, primary_key=True),
        Column("name", String),
        Column("type", String, nullable=False),
        Column("status", String, nullable=False),
        Column("task_source", String, nullable=False, default="backend"),
        Column("task_contract_version", Integer, nullable=False, default=2),
        Column("persistence_scope", String, nullable=False, default="runtime"),
        Column("lifecycle", String, nullable=False, default="resumable"),
        Column("progress", Float, nullable=False, default=0.0),
        Column("message", String, nullable=False, default=""),
        Column("created_at", Integer, nullable=False),
        Column("result", JSON),
        Column("error", String),
        Column("cancelled", Boolean, nullable=False, default=False),
        Column("request_params", JSON),
    )


@pytest.mark.asyncio
async def test_init_db_migrates_incompatible_task_table_without_losing_rows(
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

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "CREATE TABLE task ("
                    "id VARCHAR PRIMARY KEY, "
                    "name VARCHAR, "
                    "type VARCHAR NOT NULL, "
                    "status VARCHAR NOT NULL, "
                    "progress FLOAT, "
                    "created_at INTEGER NOT NULL, "
                    "legacy_payload VARCHAR"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO task "
                    "(id, name, type, status, progress, created_at, legacy_payload) "
                    "VALUES "
                    "('old-task', 'Existing download', 'download', 'pending', 42.5, 1, 'keep')"
                )
            )

        await init_db()

        async with async_session_maker() as session:
            result = await session.execute(select(Task))
            tasks = result.scalars().all()
            assert len(tasks) == 1
            migrated_task = tasks[0]
            assert migrated_task.id == "old-task"
            assert migrated_task.name == "Existing download"
            assert migrated_task.type == "download"
            assert migrated_task.status == "pending"
            assert migrated_task.progress == 42.5
            assert migrated_task.created_at == 1000
            assert migrated_task.task_source == "backend"
            assert migrated_task.task_contract_version == TASK_CONTRACT_VERSION
            assert migrated_task.persistence_scope == "runtime"
            assert migrated_task.lifecycle == TASK_LIFECYCLE["resumable"]
            assert migrated_task.message_code == "queued"
            assert migrated_task.message_params == {}
            assert migrated_task.cancelled is False

        async with engine.begin() as conn:
            columns = await conn.run_sync(
                lambda sync_conn: {
                    column["name"]
                    for column in database_module.inspect(sync_conn).get_columns(Task.__tablename__)
                }
            )
            schema_version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert columns == {column.name for column in Task.__table__.columns}
        assert "task_source" in columns
        assert "task_contract_version" in columns
        assert "lifecycle" in columns
        assert "message_code" in columns
        assert "message_params" in columns
        assert "message" not in columns
        assert "legacy_payload" not in columns
        assert schema_version == TASK_SCHEMA_VERSION

        # Startup is idempotent and preserves the migrated task.
        await init_db()
        async with async_session_maker() as session:
            result = await session.execute(select(Task))
            assert [task.id for task in result.scalars().all()] == ["old-task"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_v1_payload_migration_canonicalizes_requests_results_and_is_idempotent(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-v1.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    output_ref = {
        "path": "D:/renders/final.mp4",
        "name": "final.mp4",
        "type": "video/mp4",
        "media_kind": "video",
        "role": "output",
    }
    subtitle_context_ref = {
        "path": "D:/media/source.srt",
        "name": "source.srt",
        "type": "application/x-subrip",
        "media_kind": "subtitle",
        "role": "context",
    }
    common = {
        "status": "completed",
        "task_source": "backend",
        "task_contract_version": 1,
        "persistence_scope": "runtime",
        "lifecycle": "resumable",
        "progress": 100.0,
        "message": "done",
        "created_at": 1_700_000_000,
        "cancelled": False,
        "error": None,
    }
    rows = [
        {
            **common,
            "id": "legacy-synthesis",
            "type": "synthesis",
            "request_params": {
                "video_path": "D:/media/source.mp4",
                "srt_path": "D:/media/source.srt",
                "output_path": "D:/renders/final.mp4",
                "watermark_path": "D:/media/logo.png",
                "options": {"preset": "fast"},
            },
            "result": {
                "success": True,
                "files": [
                    {
                        "type": "video",
                        "path": "D:/renders/final.mp4",
                        "label": "synthesis_output",
                        "mime_type": "video/mp4",
                    }
                ],
                "meta": {
                    "video_ref": output_ref,
                    "output_ref": output_ref,
                    "context_ref": subtitle_context_ref,
                    "subtitle_ref": subtitle_context_ref,
                    "options": {"preset": "fast"},
                    "model_path": "D:/models/encoder.bin",
                },
            },
        },
        {
            **common,
            "id": "legacy-pipeline",
            "type": "pipeline",
            "request_params": {
                "pipeline_id": "legacy-flow",
                "steps": [
                    {
                        "step_name": "transcribe",
                        "params": {
                            "audio_path": "D:/media/source.mp4",
                            "model": "base",
                        },
                    },
                    {
                        "step_name": "translate",
                        "params": {
                            "srt_path": "D:/media/source.srt",
                            "target_language": "Chinese",
                        },
                    },
                    {
                        "step_name": "synthesize",
                        "params": {
                            "video_path": "D:/media/source.mp4",
                            "subtitle_path": "D:/media/source.srt",
                            "output_path": "D:/renders/final.mp4",
                            "watermark_path": "D:/media/logo.png",
                        },
                    },
                ],
            },
            "result": {
                "success": True,
                "files": [
                    {
                        "type": "video",
                        "path": "D:/renders/final.mp4",
                        "mime_type": "video/mp4",
                    }
                ],
                "meta": {
                    "video_path": "D:/renders/final.mp4",
                    "output_ref": output_ref,
                    "context_ref": subtitle_context_ref,
                    "execution_trace": [{"step": "synthesize", "status": "success"}],
                },
            },
        },
        {
            **common,
            "id": "legacy-download",
            "type": "download",
            "request_params": {"url": "https://example.com/video"},
            "result": {
                "success": True,
                "meta": {
                    "title": "demo",
                    "download_artifacts": {
                        "primary": {
                            "path": "D:/downloads/demo.mp4",
                            "type": "video",
                            "mime_type": "video/mp4",
                        },
                        "subtitle": {
                            "path": "D:/downloads/demo.srt",
                            "type": "subtitle",
                            "mime_type": "application/x-subrip",
                        },
                        "warnings": ["subtitle converted"],
                        "recovery": [
                            {"strategy": "media_id", "path": "D:/downloads/demo.mp4"}
                        ],
                    },
                },
            },
        },
    ]
    legacy_task = legacy_v2_task_table()

    try:
        async with engine.begin() as conn:
            await conn.run_sync(legacy_task.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, 1)"
                ),
                {"component": TASK_SCHEMA_COMPONENT},
            )
            await conn.execute(legacy_task.insert(), rows)

        await init_db()

        async with async_session_maker() as session:
            query = await session.execute(select(Task).order_by(Task.id))
            tasks = {task.id: task for task in query.scalars().all()}

        synthesis = tasks["legacy-synthesis"]
        assert synthesis.request_params["video_ref"]["path"] == "D:/media/source.mp4"
        assert synthesis.request_params["srt_ref"]["path"] == "D:/media/source.srt"
        assert synthesis.request_params["output_ref"]["path"] == "D:/renders/final.mp4"
        assert synthesis.request_params["watermark_ref"]["path"] == "D:/media/logo.png"
        assert not {"video_path", "srt_path", "output_path"} & synthesis.request_params.keys()
        synthesis_result = TaskResult.model_validate(synthesis.result)
        assert [(item.kind, item.ref.path) for item in synthesis_result.artifacts] == [
            ("video", "D:/renders/final.mp4")
        ]
        assert synthesis_result.meta == {
            "options": {"preset": "fast"},
            "model_path": "D:/models/encoder.bin",
        }

        pipeline = tasks["legacy-pipeline"]
        step_params = {
            step["step_name"]: step["params"]
            for step in pipeline.request_params["steps"]
        }
        assert step_params["transcribe"]["audio_ref"]["path"] == "D:/media/source.mp4"
        assert step_params["translate"]["context_ref"]["path"] == "D:/media/source.srt"
        assert step_params["translate"]["target_language"] == "SimplifiedChinese"
        assert step_params["synthesize"]["video_ref"]["path"] == "D:/media/source.mp4"
        assert step_params["synthesize"]["srt_ref"]["path"] == "D:/media/source.srt"
        assert step_params["synthesize"]["output_ref"]["path"] == "D:/renders/final.mp4"
        assert step_params["synthesize"]["watermark_ref"]["path"] == "D:/media/logo.png"
        assert all(
            not any(key.endswith("_path") for key in params)
            for params in step_params.values()
        )
        pipeline_result = TaskResult.model_validate(pipeline.result)
        assert [item.ref.path for item in pipeline_result.artifacts] == [
            "D:/renders/final.mp4"
        ]
        assert pipeline_result.meta == {
            "execution_trace": [{"step": "synthesize", "status": "success"}]
        }

        download_result = TaskResult.model_validate(tasks["legacy-download"].result)
        assert [(item.kind, item.ref.path) for item in download_result.artifacts] == [
            ("video", "D:/downloads/demo.mp4"),
            ("subtitle", "D:/downloads/demo.srt"),
        ]
        assert download_result.meta == {
            "title": "demo",
            "warnings": ["subtitle converted"],
            "recovery_strategies": ["media_id"],
        }

        for task in tasks.values():
            assert task.task_contract_version == TASK_CONTRACT_VERSION
            assert task.persistence_scope == "history"
            assert task.lifecycle == TASK_LIFECYCLE["history_only"]
            assert task.message_code == "completed"
            assert task.message_params == {}
            assert task.created_at == 1_700_000_000_000

        async with engine.begin() as conn:
            schema_version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert schema_version == TASK_SCHEMA_VERSION

        first_snapshot = {
            task_id: (
                task.request_params,
                task.result,
                task.created_at,
                task.message_code,
                task.message_params,
            )
            for task_id, task in tasks.items()
        }
        await init_db()
        async with async_session_maker() as session:
            query = await session.execute(select(Task).order_by(Task.id))
            second_snapshot = {
                task.id: (
                    task.request_params,
                    task.result,
                    task.created_at,
                    task.message_code,
                    task.message_params,
                )
                for task in query.scalars().all()
            }
        assert second_snapshot == first_snapshot
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_v2_message_migration_uses_status_codes_and_removes_legacy_column(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-v2-messages.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)
    legacy_task = legacy_v2_task_table()
    expected_codes = {
        "pending": "queued",
        "running": "running",
        "processing_result": "running",
        "completed": "completed",
        "failed": "failed",
        "cancelled": "cancelled",
        "paused": "paused",
    }

    try:
        async with engine.begin() as conn:
            await conn.run_sync(legacy_task.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, 2)"
                ),
                {"component": TASK_SCHEMA_COMPONENT},
            )
            await conn.execute(
                legacy_task.insert(),
                [
                    {
                        "id": f"v2-{status}",
                        "name": status,
                        "type": "download",
                        "status": status,
                        "task_source": "backend",
                        "task_contract_version": 2,
                        "persistence_scope": "runtime",
                        "lifecycle": "resumable",
                        "progress": 0.0,
                        "message": f"legacy {status} message",
                        "created_at": 1_700_000_000_000,
                        "cancelled": status == "cancelled",
                    }
                    for status in expected_codes
                ],
            )

        await init_db()

        async with async_session_maker() as session:
            result = await session.execute(select(Task).order_by(Task.id))
            tasks = result.scalars().all()
        migrated_by_id = {task.id: task for task in tasks}
        for status, message_code in expected_codes.items():
            task = migrated_by_id[f"v2-{status}"]
            if status == "processing_result":
                assert task.status == "paused"
                assert task.message_code == "interrupted_by_restart"
            else:
                assert task.status == status
                assert task.message_code == message_code
            assert task.message_params == {}
        assert all(task.task_contract_version == TASK_CONTRACT_VERSION for task in tasks)

        async with engine.begin() as conn:
            columns = await conn.run_sync(
                lambda sync_conn: {
                    column["name"]
                    for column in database_module.inspect(sync_conn).get_columns("task")
                }
            )
        assert "message" not in columns
        assert {"message_code", "message_params"} <= columns
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_unstamped_current_schema_preserves_structured_message_descriptor(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-unstamped-v3.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Task.__table__.create)
            await conn.execute(
                Task.__table__.insert().values(
                    id="unstamped-current-task",
                    name="Download",
                    type="download",
                    status="running",
                    task_source="backend",
                    task_contract_version=TASK_CONTRACT_VERSION,
                    persistence_scope="runtime",
                    lifecycle="resumable",
                    progress=42.0,
                    message_code="download_progress",
                    message_params={"percent": 42, "speed": "3.2 MiB/s"},
                    created_at=1_700_000_000_000,
                    cancelled=False,
                )
            )

        await init_db()

        async with async_session_maker() as session:
            task = await session.get(Task, "unstamped-current-task")
        assert task is not None
        assert task.message_code == "download_progress"
        assert task.message_params == {"percent": 42, "speed": "3.2 MiB/s"}

        async with engine.begin() as conn:
            version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert version == TASK_SCHEMA_VERSION
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_v4_catalog_migration_removes_retired_tasks_and_upgrades_remaining_rows(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-v3-catalog.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Task.__table__.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, 3)"
                ),
                {"component": TASK_SCHEMA_COMPONENT},
            )
            await conn.execute(
                Task.__table__.insert(),
                [
                    {
                        "id": "retired-task",
                        "name": "Retired operation",
                        "type": "cleanup",
                        "status": "completed",
                        "task_source": "backend",
                        "task_contract_version": 3,
                        "persistence_scope": "history",
                        "lifecycle": "history-only",
                        "progress": 100.0,
                        "message_code": "completed",
                        "message_params": {},
                        "created_at": 1_700_000_000_000,
                        "cancelled": False,
                    },
                    {
                        "id": "active-task",
                        "name": "Download",
                        "type": "download",
                        "status": "running",
                        "task_source": "backend",
                        "task_contract_version": 3,
                        "persistence_scope": "runtime",
                        "lifecycle": "resumable",
                        "progress": 25.0,
                        "message_code": "download_progress",
                        "message_params": {"percent": 25},
                        "created_at": 1_700_000_000_000,
                        "cancelled": False,
                    },
                    {
                        "id": "retired-segment-task",
                        "name": "Queued segment",
                        "type": "transcribe_segment",
                        "status": "pending",
                        "task_source": "backend",
                        "task_contract_version": 3,
                        "persistence_scope": "runtime",
                        "lifecycle": "resumable",
                        "progress": 0.0,
                        "message_code": "queued",
                        "message_params": {},
                        "created_at": 1_700_000_000_000,
                        "cancelled": False,
                    },
                ],
            )

        await init_db()

        async with async_session_maker() as session:
            assert await session.get(Task, "retired-task") is None
            assert await session.get(Task, "retired-segment-task") is None
            active_task = await session.get(Task, "active-task")
        assert active_task is not None
        assert active_task.task_contract_version == TASK_CONTRACT_VERSION

        async with engine.begin() as conn:
            version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
            archived_payload = (
                await conn.execute(
                    text(
                        "SELECT payload FROM mediaflow_retired_task_archive "
                        "WHERE id = 'retired-task'"
                    )
                )
            ).scalar_one()
            archived_segment_payload = (
                await conn.execute(
                    text(
                        "SELECT payload FROM mediaflow_retired_task_archive "
                        "WHERE id = 'retired-segment-task'"
                    )
                )
            ).scalar_one()
        assert version == TASK_SCHEMA_VERSION
        assert json.loads(archived_payload)["type"] == "cleanup"
        assert json.loads(archived_segment_payload)["type"] == "transcribe_segment"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_unstamped_current_columns_are_treated_as_v1_payloads(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-unstamped.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)
    legacy_task = legacy_v2_task_table()

    try:
        async with engine.begin() as conn:
            await conn.run_sync(legacy_task.create)
            await conn.execute(
                legacy_task.insert().values(
                    id="unstamped-task",
                    type="synthesis",
                    status="completed",
                    task_source="backend",
                    task_contract_version=1,
                    persistence_scope="runtime",
                    lifecycle="resumable",
                    progress=100.0,
                    message="done",
                    created_at=1_700_000_000,
                    cancelled=False,
                    request_params={
                        "video_path": "D:/media/source.mp4",
                        "output_path": "D:/renders/result.mp4",
                    },
                    result={
                        "files": [{"type": "video", "path": "D:/renders/result.mp4"}],
                    },
                )
            )

        await init_db()

        async with async_session_maker() as session:
            task = await session.get(Task, "unstamped-task")
        assert task is not None
        assert task.task_contract_version == TASK_CONTRACT_VERSION
        assert task.message_code == "completed"
        assert task.message_params == {}
        assert task.request_params["video_ref"]["path"] == "D:/media/source.mp4"
        migrated_result = TaskResult.model_validate(task.result)
        assert [artifact.ref.path for artifact in migrated_result.artifacts] == [
            "D:/renders/result.mp4"
        ]

        async with engine.begin() as conn:
            version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert version == TASK_SCHEMA_VERSION
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_v1_payload_migration_rejects_future_contract_before_updating_any_row(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-future-payload.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    common = {
        "type": "synthesis",
        "status": "completed",
        "task_source": "backend",
        "persistence_scope": "runtime",
        "lifecycle": "resumable",
        "progress": 100.0,
        "message": "unchanged",
        "created_at": 1_700_000_000,
        "cancelled": False,
        "request_params": {
            "video_path": "D:/media/source.mp4",
            "output_path": "D:/renders/result.mp4",
        },
        "result": {"files": [{"type": "video", "path": "D:/renders/result.mp4"}]},
    }
    legacy_task = legacy_v2_task_table()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(legacy_task.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, 1)"
                ),
                {"component": TASK_SCHEMA_COMPONENT},
            )
            await conn.execute(
                legacy_task.insert(),
                [
                    {**common, "id": "ordinary-v1", "task_contract_version": 1},
                    {
                        **common,
                        "id": "future-payload",
                        "task_contract_version": TASK_CONTRACT_VERSION + 1,
                    },
                ],
            )

        with pytest.raises(RuntimeError, match="payload contract is newer"):
            await init_db()

        async with engine.begin() as conn:
            rows = (
                await conn.execute(
                    text(
                        "SELECT id, task_contract_version, message, request_params, result "
                        "FROM task ORDER BY id"
                    )
                )
            ).mappings().all()
            version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert version == 1
        assert [row["task_contract_version"] for row in rows] == [
            TASK_CONTRACT_VERSION + 1,
            1,
        ]
        assert all(row["message"] == "unchanged" for row in rows)
        assert all("video_path" in row["request_params"] for row in rows)
        assert all("files" in row["result"] for row in rows)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_task_migration_failure_rolls_back_payload_and_version(
    tmp_path,
    monkeypatch,
):
    db_path = tmp_path / "mediaflow-rollback.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "async_session_maker", async_session_maker)

    def failing_migration(sync_connection):
        sync_connection.execute(text("UPDATE task SET message = 'partially-updated'"))
        raise RuntimeError("forced migration failure")

    legacy_task = legacy_v2_task_table()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(legacy_task.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, 1)"
                ),
                {"component": TASK_SCHEMA_COMPONENT},
            )
            await conn.execute(
                legacy_task.insert().values(
                    id="rollback-task",
                    type="download",
                    status="pending",
                    task_source="backend",
                    task_contract_version=1,
                    persistence_scope="runtime",
                    lifecycle="resumable",
                    progress=0.0,
                    message="original",
                    created_at=1_700_000_000,
                    cancelled=False,
                )
            )

        monkeypatch.setitem(database_module._TASK_MIGRATIONS, 1, failing_migration)
        with pytest.raises(RuntimeError, match="forced migration failure"):
            await init_db()

        async with engine.begin() as conn:
            message = (
                await conn.execute(
                    text("SELECT message FROM task WHERE id = 'rollback-task'")
                )
            ).scalar_one()
            version = (
                await conn.execute(
                    text(
                        f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
                        "WHERE component = :component"
                    ),
                    {"component": TASK_SCHEMA_COMPONENT},
                )
            ).scalar_one()
        assert message == "original"
        assert version == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_init_db_refuses_unknown_future_task_schema_without_touching_data(
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

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Task.__table__.create)
            await conn.execute(
                text(
                    f"CREATE TABLE {SCHEMA_VERSION_TABLE} ("
                    "component VARCHAR PRIMARY KEY NOT NULL, "
                    "version INTEGER NOT NULL)"
                )
            )
            await conn.execute(
                text(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
                    "VALUES (:component, :version)"
                ),
                {
                    "component": TASK_SCHEMA_COMPONENT,
                    "version": TASK_SCHEMA_VERSION + 1,
                },
            )
            await conn.execute(
                text(
                    "INSERT INTO task "
                    "(id, type, status, task_source, task_contract_version, "
                    "persistence_scope, lifecycle, progress, message_code, message_params, "
                    "created_at, cancelled) "
                    "VALUES ('future-task', 'download', 'pending', 'backend', "
                    ":contract_version, 'runtime', 'resumable', 0, 'queued', '{}', 1, 0)"
                ),
                {"contract_version": TASK_CONTRACT_VERSION},
            )

        with pytest.raises(RuntimeError, match="newer than this application"):
            await init_db()

        async with engine.begin() as conn:
            task_id = (
                await conn.execute(text("SELECT id FROM task WHERE id = 'future-task'"))
            ).scalar_one()
        assert task_id == "future-task"
    finally:
        await engine.dispose()

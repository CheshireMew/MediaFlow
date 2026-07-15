from contextlib import asynccontextmanager

from sqlmodel import SQLModel
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import Column, Integer, JSON, MetaData, String, Table, case, func, inspect, literal, select, text

from backend.config import settings
from backend.contracts import (
    TASK_CONTRACT_VERSION,
    TASK_LIFECYCLE,
    TASK_MESSAGE_CODES,
    task_lifecycle,
    task_persistence_scope,
)
from backend.models.task_model import Task
from backend.models.task_model import task_timestamp_ms
from backend.models.media_contracts import TaskResult
from backend.core.task_payload_migration import migrate_task_payload_v1_to_v2

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


TASK_SCHEMA_COMPONENT = "task"
TASK_SCHEMA_VERSION = 9
SCHEMA_VERSION_TABLE = "mediaflow_schema_version"
_TASK_MIGRATION_TABLE = "task__migration_v1"
_TASK_MESSAGE_MIGRATION_TABLE = "task__migration_v3"
_TASK_CONTRACT_VERSION_V1 = 1
_TASK_CONTRACT_VERSION_V2 = 2
_TASK_REQUIRED_LEGACY_COLUMNS = {"id", "type", "status"}
_TASK_SCHEMA_V2_COLUMNS = {
    "id",
    "name",
    "type",
    "status",
    "task_source",
    "task_contract_version",
    "persistence_scope",
    "lifecycle",
    "progress",
    "message",
    "created_at",
    "result",
    "error",
    "cancelled",
    "request_params",
}
_TASK_COLUMN_DEFAULTS = {
    "name": None,
    "task_source": "backend",
    "task_contract_version": _TASK_CONTRACT_VERSION_V1,
    "persistence_scope": "runtime",
    "lifecycle": TASK_LIFECYCLE["resumable"],
    "progress": 0.0,
    "revision": 0,
    "message_code": "queued",
    "message_params": "{}",
    "created_at": task_timestamp_ms,
    "result": None,
    "error": None,
    "cancelled": False,
    "request_params": None,
}


def _ensure_schema_version_table(sync_connection) -> None:
    sync_connection.execute(
        text(
            f"CREATE TABLE IF NOT EXISTS {SCHEMA_VERSION_TABLE} ("
            "component VARCHAR PRIMARY KEY NOT NULL, "
            "version INTEGER NOT NULL"
            ")"
        )
    )


def _read_schema_version(sync_connection, component: str) -> int | None:
    return sync_connection.execute(
        text(
            f"SELECT version FROM {SCHEMA_VERSION_TABLE} "
            "WHERE component = :component"
        ),
        {"component": component},
    ).scalar_one_or_none()


def _write_schema_version(sync_connection, component: str, version: int) -> None:
    sync_connection.execute(
        text(
            f"INSERT INTO {SCHEMA_VERSION_TABLE} (component, version) "
            "VALUES (:component, :version) "
            "ON CONFLICT(component) DO UPDATE SET version = excluded.version"
        ),
        {"component": component, "version": version},
    )


def _task_contract_columns() -> set[str]:
    return {column.name for column in Task.__table__.columns}


def _migrate_task_schema_v0_to_v1(sync_connection) -> None:
    legacy_metadata = MetaData()
    legacy_task = Table(
        Task.__tablename__,
        legacy_metadata,
        autoload_with=sync_connection,
    )
    legacy_columns = set(legacy_task.columns.keys())
    missing_required = sorted(_TASK_REQUIRED_LEGACY_COLUMNS - legacy_columns)
    if missing_required:
        raise RuntimeError(
            "Cannot migrate task schema without identity columns: "
            f"{missing_required}. Existing data was left untouched."
        )

    if inspect(sync_connection).has_table(_TASK_MIGRATION_TABLE):
        raise RuntimeError(
            f"Stale migration table '{_TASK_MIGRATION_TABLE}' exists; "
            "refusing to overwrite task data."
        )

    migration_metadata = MetaData()
    migrated_task = Task.__table__.to_metadata(
        migration_metadata,
        name=_TASK_MIGRATION_TABLE,
    )
    migrated_task.create(sync_connection)

    target_columns: list[str] = []
    source_expressions = []
    for target_column in Task.__table__.columns:
        column_name = target_column.name
        target_columns.append(column_name)

        if column_name == "task_contract_version":
            source_expressions.append(
                literal(_TASK_CONTRACT_VERSION_V1).label(column_name)
            )
            continue

        if column_name == "message_code":
            legacy_message_code = (
                legacy_task.c.message_code
                if "message_code" in legacy_columns
                else None
            )
            message_code = _message_code_for_status(legacy_task.c.status)
            if legacy_message_code is not None:
                message_code = func.coalesce(legacy_message_code, message_code)
            source_expressions.append(
                message_code.label(column_name)
            )
            continue

        if column_name in legacy_columns:
            legacy_value = legacy_task.c[column_name]
            default = _TASK_COLUMN_DEFAULTS.get(column_name)
            if default is not None:
                default_value = default() if callable(default) else default
                legacy_value = func.coalesce(legacy_value, literal(default_value))
            source_expressions.append(legacy_value.label(column_name))
            continue

        default = _TASK_COLUMN_DEFAULTS.get(column_name)
        default_value = default() if callable(default) else default
        source_expressions.append(literal(default_value).label(column_name))

    sync_connection.execute(
        migrated_task.insert().from_select(
            target_columns,
            select(*source_expressions),
        )
    )
    legacy_task.drop(sync_connection)
    sync_connection.execute(
        text(
            f'ALTER TABLE "{_TASK_MIGRATION_TABLE}" '
            f'RENAME TO "{Task.__tablename__}"'
        )
    )


def _migrate_task_payloads_v1_to_v2(sync_connection) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    rows = sync_connection.execute(
        select(
            task_table.c.id,
            task_table.c.type,
            task_table.c.status,
            task_table.c.task_contract_version,
            task_table.c.created_at,
            task_table.c.error,
            task_table.c.request_params,
            task_table.c.result,
        )
    ).mappings().all()

    for row in rows:
        raw_contract_version = row["task_contract_version"]
        try:
            contract_version = int(raw_contract_version)
        except (TypeError, ValueError):
            contract_version = _TASK_CONTRACT_VERSION_V1
        if contract_version > TASK_CONTRACT_VERSION:
            raise RuntimeError(
                "Task payload contract is newer than this application: "
                f"task={row['id']}, database={contract_version}, "
                f"supported={TASK_CONTRACT_VERSION}."
            )

    migrated_rows: list[dict] = []
    for row in rows:
        request_params, result = migrate_task_payload_v1_to_v2(
            task_type=str(row["type"]),
            status=str(row["status"]),
            request_params=row["request_params"],
            result=row["result"],
            task_error=row["error"],
        )
        created_at = row["created_at"]
        if isinstance(created_at, (int, float)) and 0 < created_at < 100_000_000_000:
            created_at = int(created_at * 1000)

        status = str(row["status"])
        migrated_rows.append(
            {
                "id": row["id"],
                "request_params": request_params,
                "result": result,
                "created_at": created_at,
                "task_contract_version": _TASK_CONTRACT_VERSION_V2,
                "persistence_scope": task_persistence_scope(status),
                "lifecycle": task_lifecycle(status),
            }
        )

    for migrated in migrated_rows:
        sync_connection.execute(
            task_table.update()
            .where(task_table.c.id == migrated["id"])
            .values(
                request_params=migrated["request_params"],
                result=migrated["result"],
                created_at=migrated["created_at"],
                task_contract_version=migrated["task_contract_version"],
                persistence_scope=migrated["persistence_scope"],
                lifecycle=migrated["lifecycle"],
            )
        )

    if migrated_rows:
        logger.info(
            "Migrated {} persisted task payloads to contract version {}.",
            len(migrated_rows),
            _TASK_CONTRACT_VERSION_V2,
        )


def _message_code_for_status(status_column):
    return case(
        (status_column == "pending", "queued"),
        (status_column == "running", "running"),
        (status_column == "processing_result", "running"),
        (status_column == "completed", "completed"),
        (status_column == "failed", "failed"),
        (status_column == "cancelled", "cancelled"),
        (status_column == "paused", "paused"),
        else_="starting",
    )


def _migrate_task_messages_v2_to_v3(sync_connection) -> None:
    existing_columns = {
        column["name"]
        for column in inspect(sync_connection).get_columns(Task.__tablename__)
    }
    target_columns = _task_contract_columns()

    if existing_columns == target_columns:
        task_table = Task.__table__
        sync_connection.execute(
            task_table.update().values(
                task_contract_version=TASK_CONTRACT_VERSION,
            )
        )
        return

    if "message" not in existing_columns:
        raise RuntimeError(
            "Cannot migrate task messages: the v2 message column is missing. "
            "Existing data was left untouched."
        )
    if inspect(sync_connection).has_table(_TASK_MESSAGE_MIGRATION_TABLE):
        raise RuntimeError(
            f"Stale migration table '{_TASK_MESSAGE_MIGRATION_TABLE}' exists; "
            "refusing to overwrite task data."
        )

    legacy_task = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    migration_metadata = MetaData()
    migrated_task = Task.__table__.to_metadata(
        migration_metadata,
        name=_TASK_MESSAGE_MIGRATION_TABLE,
    )
    migrated_task.create(sync_connection)

    source_expressions = []
    for target_column in Task.__table__.columns:
        column_name = target_column.name
        if column_name == "task_contract_version":
            source_expressions.append(literal(TASK_CONTRACT_VERSION).label(column_name))
        elif column_name == "message_code":
            source_expressions.append(
                _message_code_for_status(legacy_task.c.status).label(column_name)
            )
        elif column_name == "message_params":
            source_expressions.append(literal("{}").label(column_name))
        elif column_name == "revision":
            source_expressions.append(literal(0).label(column_name))
        else:
            source_expressions.append(legacy_task.c[column_name].label(column_name))

    sync_connection.execute(
        migrated_task.insert().from_select(
            [column.name for column in Task.__table__.columns],
            select(*source_expressions),
        )
    )
    legacy_task.drop(sync_connection)
    sync_connection.execute(
        text(
            f'ALTER TABLE "{_TASK_MESSAGE_MIGRATION_TABLE}" '
            f'RENAME TO "{Task.__tablename__}"'
        )
    )


def _archive_retired_tasks(sync_connection, retired_task_types: tuple[str, ...]) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    retired_rows = sync_connection.execute(
        select(task_table).where(task_table.c.type.in_(retired_task_types))
    ).mappings().all()
    if retired_rows:
        archive_table = Table(
            "mediaflow_retired_task_archive",
            MetaData(),
            Column("id", String, primary_key=True),
            Column("archived_at", Integer, nullable=False),
            Column("reason", String, nullable=False),
            Column("payload", JSON, nullable=False),
        )
        archive_table.create(sync_connection, checkfirst=True)
        sync_connection.execute(
            archive_table.insert().prefix_with("OR IGNORE"),
            [
                {
                    "id": str(row["id"]),
                    "archived_at": task_timestamp_ms(),
                    "reason": "retired_task_type",
                    "payload": dict(row),
                }
                for row in retired_rows
            ],
        )
        sync_connection.execute(
            task_table.delete().where(task_table.c.type.in_(retired_task_types))
        )
        logger.info(
            "Archived {} persisted tasks for retired media operations.",
            len(retired_rows),
        )


def _migrate_task_catalog_v3_to_v4(sync_connection) -> None:
    _archive_retired_tasks(sync_connection, ("enhancement", "cleanup", "extract"))
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )

    sync_connection.execute(
        task_table.update().values(task_contract_version=TASK_CONTRACT_VERSION)
    )


def _migrate_task_revision_v4_to_v5(sync_connection) -> None:
    existing_columns = {
        column["name"]
        for column in inspect(sync_connection).get_columns(Task.__tablename__)
    }
    if "revision" not in existing_columns:
        sync_connection.execute(
            text(f'ALTER TABLE "{Task.__tablename__}" ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
        )
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    _archive_retired_tasks(sync_connection, ("transcribe_segment",))
    sync_connection.execute(
        task_table.update().values(task_contract_version=TASK_CONTRACT_VERSION)
    )


def _migrate_task_status_v5_to_v6(sync_connection) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    sync_connection.execute(
        task_table.update()
        .where(task_table.c.status == "processing_result")
        .values(
            status="paused",
            persistence_scope=task_persistence_scope("paused"),
            lifecycle=task_lifecycle("paused"),
            message_code="interrupted_by_restart",
            message_params={},
            cancelled=False,
            revision=task_table.c.revision + 1,
        )
    )
    sync_connection.execute(
        task_table.update().values(task_contract_version=TASK_CONTRACT_VERSION)
    )


def _pipeline_request_for_retired_task(
    task_type: str,
    task_name: str | None,
    request_params: dict | None,
) -> dict:
    params = dict(request_params or {})
    if isinstance(params.get("steps"), list):
        return {
            "pipeline_id": params.get("pipeline_id") or f"migrated_{task_type}_task",
            "task_name": params.get("task_name") or task_name,
            "steps": params["steps"],
        }

    step_names = {
        "download": "download",
        "transcribe": "transcribe",
        "translate": "translate",
        "synthesis": "synthesize",
        "clip_export": "clip_export",
    }
    step_name = step_names.get(task_type)
    if step_name is None:
        raise ValueError(f"Cannot migrate unsupported task type to pipeline: {task_type}")
    return {
        "pipeline_id": f"migrated_{task_type}_task",
        "task_name": task_name,
        "steps": [{"step_name": step_name, "params": params}],
    }


def _migrate_task_execution_boundary_v6_to_v7(sync_connection) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    retired_types = ("download", "transcribe", "translate", "synthesis", "clip_export")
    rows = sync_connection.execute(
        select(
            task_table.c.id,
            task_table.c.type,
            task_table.c.name,
            task_table.c.request_params,
        ).where(task_table.c.type.in_(retired_types))
    ).mappings().all()
    for row in rows:
        sync_connection.execute(
            task_table.update()
            .where(task_table.c.id == row["id"])
            .values(
                type="pipeline",
                request_params=_pipeline_request_for_retired_task(
                    str(row["type"]),
                    row["name"],
                    row["request_params"],
                ),
                task_contract_version=TASK_CONTRACT_VERSION,
            )
        )
    sync_connection.execute(
        task_table.update().values(task_contract_version=TASK_CONTRACT_VERSION)
    )


def _migrate_task_message_catalog_v7_to_v8(sync_connection) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    retired_message_codes = (
        "asr_finalizing",
        "translation_starting",
        "synthesis_preparing",
        "synthesis_completed",
        "clip_export_preparing",
    )
    sync_connection.execute(
        task_table.update()
        .where(task_table.c.message_code.in_(retired_message_codes))
        .values(
            message_code=_message_code_for_status(task_table.c.status),
            message_params={},
            revision=task_table.c.revision + 1,
        )
    )

    unknown_codes = sync_connection.execute(
        select(task_table.c.message_code)
        .where(~task_table.c.message_code.in_(tuple(TASK_MESSAGE_CODES)))
        .distinct()
        .order_by(task_table.c.message_code)
    ).scalars().all()
    if unknown_codes:
        raise RuntimeError(
            "Cannot migrate task message catalog because persisted tasks contain "
            f"unknown message codes: {unknown_codes}. Existing data was left untouched."
        )

    sync_connection.execute(
        task_table.update().values(task_contract_version=TASK_CONTRACT_VERSION)
    )


def _step_params(request_params: object, step_name: str) -> dict:
    if not isinstance(request_params, dict):
        return {}
    steps = request_params.get("steps")
    if not isinstance(steps, list):
        return {}
    for step in steps:
        if not isinstance(step, dict) or step.get("step_name") != step_name:
            continue
        params = step.get("params")
        return params if isinstance(params, dict) else {}
    return {}


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _float_value(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _execution_trace(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    trace: list[dict] = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("step"), str):
            continue
        status = item.get("status")
        if status not in {"success", "failed"}:
            continue
        trace.append(
            {
                "step": item["step"],
                "duration": _float_value(item.get("duration")),
                "status": status,
                "error": item.get("error") if isinstance(item.get("error"), str) else None,
                "timestamp": _float_value(item.get("timestamp")),
            }
        )
    return trace


def _migrate_task_result_v8_to_v9(row: dict) -> dict | None:
    raw_result = row.get("result")
    if raw_result is None:
        return None
    if not isinstance(raw_result, dict):
        raise RuntimeError(
            f"Cannot migrate malformed task result for task {row.get('id')}."
        )

    raw_meta = raw_result.get("meta")
    meta = raw_meta if isinstance(raw_meta, dict) else {}
    request_params = row.get("request_params")
    outputs: dict[str, object] = {}

    download_params = _step_params(request_params, "download")
    if download_params:
        filename = str(meta.get("filename") or meta.get("media_filename") or "unknown")
        outputs["download"] = {
            "id": str(meta.get("id") or row.get("id") or "migrated-task"),
            "title": str(meta.get("title") or filename),
            "duration": _float_value(meta.get("duration")),
            "filename": filename,
            "source_url": str(meta.get("source_url") or download_params.get("url") or ""),
            "warnings": _string_list(meta.get("warnings")),
            "recovery_strategies": _string_list(meta.get("recovery_strategies")),
        }

    transcribe_params = _step_params(request_params, "transcribe")
    if transcribe_params:
        segments = meta.get("segments")
        outputs["transcription"] = {
            "task_id": str(meta.get("task_id") or row.get("id") or "migrated-task"),
            "language": str(meta.get("language") or transcribe_params.get("language") or "auto"),
            "duration": _float_value(meta.get("duration")),
            "segments": segments if isinstance(segments, list) else [],
            "text": str(meta.get("text") or meta.get("transcript") or ""),
        }

    translate_params = _step_params(request_params, "translate")
    if translate_params:
        translated_segments = meta.get("translated_segments")
        if not isinstance(translated_segments, list):
            translated_segments = meta.get("segments")
        outputs["translation"] = {
            "segments": translated_segments if isinstance(translated_segments, list) else [],
            "language": str(
                meta.get("language")
                or translate_params.get("target_language")
                or "SimplifiedChinese"
            ),
            "mode": str(translate_params.get("mode") or "standard"),
        }

    if _step_params(request_params, "synthesize"):
        outputs["synthesis"] = {"completed": True}

    if _step_params(request_params, "clip_export"):
        outputs["clip_export"] = {
            "count": int(_float_value(meta.get("clip_output_count")))
        }

    execution_trace = _execution_trace(meta.get("execution_trace"))
    return TaskResult.model_validate(
        {
            "success": bool(raw_result.get("success", row.get("status") == "completed")),
            "artifacts": raw_result.get("artifacts") or [],
            "outputs": outputs,
            "execution_trace": execution_trace,
            "error": raw_result.get("error") or row.get("error"),
        }
    ).model_dump(mode="json")


def _migrate_task_result_contract_v8_to_v9(sync_connection) -> None:
    task_table = Table(
        Task.__tablename__,
        MetaData(),
        autoload_with=sync_connection,
    )
    rows = sync_connection.execute(
        select(
            task_table.c.id,
            task_table.c.status,
            task_table.c.error,
            task_table.c.request_params,
            task_table.c.result,
        )
    ).mappings().all()

    for row in rows:
        migrated_result = _migrate_task_result_v8_to_v9(dict(row))
        sync_connection.execute(
            task_table.update()
            .where(task_table.c.id == row["id"])
            .values(
                result=migrated_result,
                task_contract_version=TASK_CONTRACT_VERSION,
            )
        )


_TASK_MIGRATIONS = {
    0: _migrate_task_schema_v0_to_v1,
    1: _migrate_task_payloads_v1_to_v2,
    2: _migrate_task_messages_v2_to_v3,
    3: _migrate_task_catalog_v3_to_v4,
    4: _migrate_task_revision_v4_to_v5,
    5: _migrate_task_status_v5_to_v6,
    6: _migrate_task_execution_boundary_v6_to_v7,
    7: _migrate_task_message_catalog_v7_to_v8,
    8: _migrate_task_result_contract_v8_to_v9,
}


def _migrate_task_schema(sync_connection) -> None:
    _ensure_schema_version_table(sync_connection)
    inspector = inspect(sync_connection)
    if not inspector.has_table(Task.__tablename__):
        return

    current_columns = {column["name"] for column in inspector.get_columns(Task.__tablename__)}
    contract_columns = _task_contract_columns()
    current_version = _read_schema_version(sync_connection, TASK_SCHEMA_COMPONENT)
    if current_version is None:
        if current_columns == contract_columns:
            current_version = TASK_SCHEMA_VERSION
        elif current_columns == _TASK_SCHEMA_V2_COLUMNS:
            # Before schema stamps existed, this column layout could contain v1
            # payloads even though it already had every v2 physical column.
            current_version = 1
        else:
            current_version = 0

    if current_version > TASK_SCHEMA_VERSION:
        raise RuntimeError(
            "Task database schema is newer than this application: "
            f"database={current_version}, supported={TASK_SCHEMA_VERSION}."
        )

    while current_version < TASK_SCHEMA_VERSION:
        migration = _TASK_MIGRATIONS.get(current_version)
        if migration is None:
            raise RuntimeError(
                f"No task schema migration registered for version {current_version}."
            )
        logger.info(
            "Migrating task database schema from version {} to {} without data loss.",
            current_version,
            current_version + 1,
        )
        migration(sync_connection)
        current_version += 1
        _write_schema_version(sync_connection, TASK_SCHEMA_COMPONENT, current_version)

    migrated_columns = {
        column["name"]
        for column in inspect(sync_connection).get_columns(Task.__tablename__)
    }
    if migrated_columns != contract_columns:
        missing = sorted(contract_columns - migrated_columns)
        extra = sorted(migrated_columns - contract_columns)
        raise RuntimeError(
            "Task schema version matches but columns do not: "
            f"missing={missing}, extra={extra}. Existing data was left untouched."
        )

    _write_schema_version(sync_connection, TASK_SCHEMA_COMPONENT, TASK_SCHEMA_VERSION)


def _stamp_created_schema_versions(sync_connection) -> None:
    _ensure_schema_version_table(sync_connection)
    if inspect(sync_connection).has_table(Task.__tablename__):
        _write_schema_version(sync_connection, TASK_SCHEMA_COMPONENT, TASK_SCHEMA_VERSION)


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
        finally:
            await session.close()

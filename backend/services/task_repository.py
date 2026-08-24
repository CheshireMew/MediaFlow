import json
import math
import uuid
from pathlib import Path
from typing import Any

from loguru import logger
from pydantic import BaseModel
from sqlmodel import delete, select

from backend.config import settings
from backend.contracts import (
    TASK_CONTRACT_VERSION,
    TASK_STATUSES,
    require_task_type,
    task_lifecycle,
    task_persistence_scope,
)
from backend.core.database import get_session_context
from backend.models.application_errors import InvalidInputError, TaskConsistencyError
from backend.models.media_contracts import TaskResult
from backend.models.task_message import TaskMessageParams, validate_task_message
from backend.models.task_model import Task, task_timestamp_ms

TASK_HISTORY_STATUSES = tuple(
    status for status in TASK_STATUSES if task_persistence_scope(status) == "history"
)
TASK_RUNTIME_STATUSES = tuple(
    status for status in TASK_STATUSES if task_persistence_scope(status) == "runtime"
)
_IMMUTABLE_TASK_FIELDS = {
    "id",
    "type",
    "task_source",
    "task_contract_version",
    "created_at",
    "revision",
    "primary_operation",
    "summary_artifacts",
}
_MUTABLE_TASK_FIELDS = set(Task.model_fields) - _IMMUTABLE_TASK_FIELDS


def _clamp_progress(value):
    try:
        return max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return value


def _json_safe(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _json_safe(value.model_dump(mode="json"))
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("JSON object keys must be strings")
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise TypeError("Non-finite numbers are not valid task JSON")
        return value
    raise TypeError(f"Unsupported task JSON value: {type(value).__name__}")


def _json_payload(value: Any) -> dict | None:
    if value is None:
        return None
    payload = _json_safe(value)
    if not isinstance(payload, dict):
        raise TypeError("Task JSON payloads must be objects")
    json.dumps(payload, allow_nan=False)
    return payload


class TaskRepository:
    async def persist_task_snapshot(self, task: Task) -> None:
        """Checkpoint an already validated in-memory task without another revision bump."""
        async with get_session_context() as session:
            db_task = await session.get(Task, task.id)
            if db_task is None or int(db_task.revision or 0) > int(task.revision or 0):
                return
            for field_name in Task.model_fields:
                if field_name == "id":
                    continue
                setattr(db_task, field_name, getattr(task, field_name))
            session.add(db_task)
            await session.commit()

    async def trim_history(self) -> dict[str, int]:
        async with get_session_context() as session:
            pruned_revisions = await self._trim_history(session)
            if pruned_revisions:
                await session.commit()
        return pruned_revisions

    async def _trim_history(self, session) -> dict[str, int]:
        history_limit = settings.TASK_HISTORY_LIMIT
        statement = (
            select(Task.id, Task.revision)
            .where(Task.status.in_(TASK_HISTORY_STATUSES))
            .order_by(Task.created_at.desc(), Task.id.desc())
            .offset(history_limit)
        )
        result = await session.execute(statement)
        pruned_revisions = {
            task_id: int(revision or 0) + 1
            for task_id, revision in result.all()
        }
        pruned_task_ids = list(pruned_revisions)
        if pruned_task_ids:
            await session.execute(delete(Task).where(Task.id.in_(pruned_task_ids)))
            logger.info(
                "Pruned {} task history records beyond configured limit {}.",
                len(pruned_task_ids),
                history_limit,
            )
        return pruned_revisions

    async def load_runtime_tasks(self) -> dict[str, Task]:
        tasks_by_id: dict[str, Task] = {}
        async with get_session_context() as session:
            statement = select(Task).where(Task.status.in_(TASK_RUNTIME_STATUSES))
            result = await session.execute(statement)
            tasks = result.scalars().all()

            for task in tasks:
                if task.status != "paused":
                    task.status = "paused"
                    task.revision = int(task.revision or 0) + 1
                    task.message_code = "interrupted_by_restart"
                    task.message_params = {}
                    task.cancelled = False
                    task.persistence_scope = task_persistence_scope(task.status)
                    task.lifecycle = task_lifecycle(task.status)
                    session.add(task)
                tasks_by_id[task.id] = task

            if tasks:
                await session.commit()

        return tasks_by_id

    async def load_history_summaries(self) -> list[dict[str, Any]]:
        """Load history metadata without hydrating large request/result JSON."""
        async with get_session_context() as session:
            statement = (
                select(
                    Task.id,
                    Task.name,
                    Task.type,
                    Task.status,
                    Task.task_source,
                    Task.task_contract_version,
                    Task.persistence_scope,
                    Task.lifecycle,
                    Task.progress,
                    Task.revision,
                    Task.message_code,
                    Task.message_params,
                    Task.error,
                    Task.primary_operation,
                    Task.summary_artifacts,
                    Task.created_at,
                )
                .where(Task.status.in_(TASK_HISTORY_STATUSES))
                .order_by(Task.created_at.desc(), Task.id.desc())
                .limit(settings.TASK_HISTORY_LIMIT)
            )
            result = await session.execute(statement)
            return [dict(row) for row in result.mappings().all()]

    async def get_task(self, task_id: str) -> Task | None:
        async with get_session_context() as session:
            return await session.get(Task, task_id)

    async def create_task(
        self,
        task_type: str,
        initial_message_code: str = "queued",
        initial_message_params: TaskMessageParams | None = None,
        request_params: dict | None = None,
        task_name: str | None = None,
    ) -> Task:
        task_type = require_task_type(task_type)
        task_id = str(uuid.uuid4())
        final_name = task_name or f"{task_type.capitalize()} {task_id}"

        if request_params is not None:
            try:
                request_params = _json_payload(request_params)
            except Exception as e:
                raise InvalidInputError(
                    "Task request parameters are not valid JSON",
                    code="invalid_task_request_params",
                    details={"reason": str(e)},
                ) from e

        message_code, message_params = validate_task_message(
            initial_message_code,
            initial_message_params,
        )
        from backend.services.task_projection import primary_operation, task_artifacts

        summary_artifacts = task_artifacts(
            request_params=request_params,
            result=None,
        )
        new_task = Task(
            id=task_id,
            name=final_name,
            type=task_type,
            status="pending",
            task_source="backend",
            task_contract_version=TASK_CONTRACT_VERSION,
            persistence_scope=task_persistence_scope("pending"),
            lifecycle=task_lifecycle("pending"),
            message_code=message_code,
            message_params=message_params,
            primary_operation=primary_operation(task_type, request_params),
            summary_artifacts=[
                artifact.model_dump(mode="json") for artifact in summary_artifacts
            ],
            created_at=task_timestamp_ms(),
            request_params=request_params,
        )

        async with get_session_context() as session:
            session.add(new_task)
            await session.commit()
            await session.refresh(new_task)

        return new_task

    async def update_task(self, task_id: str, cached_task: Task | None = None, **kwargs) -> Task | None:
        unknown_fields = set(kwargs) - _MUTABLE_TASK_FIELDS
        if unknown_fields:
            raise ValueError(
                f"Unsupported task update fields: {', '.join(sorted(unknown_fields))}"
            )
        updated_task = None
        if "progress" in kwargs:
            kwargs["progress"] = _clamp_progress(kwargs["progress"])
        if "result" in kwargs and kwargs["result"] is not None:
            kwargs["result"] = TaskResult.model_validate(kwargs["result"]).model_dump(
                mode="json"
            )
        if "request_params" in kwargs:
            kwargs["request_params"] = _json_payload(kwargs["request_params"])
        if "checkpoint" in kwargs:
            kwargs["checkpoint"] = _json_payload(kwargs["checkpoint"])
        message_fields = {"message_code", "message_params"} & set(kwargs)
        if message_fields and message_fields != {"message_code", "message_params"}:
            raise ValueError(
                "Task message updates must provide message_code and message_params together"
            )
        if message_fields:
            message_code, message_params = validate_task_message(
                kwargs["message_code"],
                kwargs["message_params"],
            )
            kwargs["message_code"] = message_code
            kwargs["message_params"] = message_params

        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                incoming_status = kwargs.get("status")
                if db_task.status in {"completed", "failed", "cancelled", "paused"} and incoming_status is None:
                    return None
                cached_revision = int(cached_task.revision or 0) if cached_task else -1
                if cached_task is not None and cached_revision > int(db_task.revision or 0):
                    for field_name in _MUTABLE_TASK_FIELDS:
                        setattr(db_task, field_name, getattr(cached_task, field_name))
                if incoming_status is not None:
                    kwargs["persistence_scope"] = task_persistence_scope(str(incoming_status))
                    kwargs["lifecycle"] = task_lifecycle(str(incoming_status))
                for key, value in kwargs.items():
                    setattr(db_task, key, value)
                if "request_params" in kwargs or "result" in kwargs:
                    from backend.services.task_projection import (
                        primary_operation,
                        task_artifacts,
                    )

                    db_task.primary_operation = primary_operation(
                        db_task.type,
                        db_task.request_params,
                    )
                    db_task.summary_artifacts = [
                        artifact.model_dump(mode="json")
                        for artifact in task_artifacts(
                            request_params=db_task.request_params,
                            result=db_task.result,
                        )
                    ]
                db_task.revision = max(int(db_task.revision or 0), cached_revision) + 1

                session.add(db_task)
                await session.commit()
                await session.refresh(db_task)
                updated_task = db_task
            else:
                logger.warning(f"Task {task_id} not found in DB during update.")
                if not cached_task:
                    return None
                raise TaskConsistencyError(
                    f"Task {task_id} exists in memory but is missing from SQLite",
                    code="task_persistence_mismatch",
                    details={"task_id": task_id},
                )

        return updated_task

    async def delete_task(self, task_id: str) -> bool:
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if not db_task:
                return False
            await session.delete(db_task)
            await session.commit()
            return True

    async def delete_all_tasks(self) -> dict[str, int]:
        delete_revisions: dict[str, int] = {}
        async with get_session_context() as session:
            statement = select(Task)
            result = await session.execute(statement)
            tasks = result.scalars().all()
            delete_revisions = {
                task.id: int(task.revision or 0) + 1
                for task in tasks
            }

            if delete_revisions:
                delete_statement = delete(Task)
                await session.execute(delete_statement)
                await session.commit()

        return delete_revisions

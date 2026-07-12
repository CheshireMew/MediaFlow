import json
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from loguru import logger
from pydantic import BaseModel
from sqlmodel import delete, select

from backend.config import settings
from backend.contracts import TASK_CONTRACT_VERSION, TASK_STATUSES, task_lifecycle, task_persistence_scope
from backend.core.database import get_session_context
from backend.models.task_model import Task, task_timestamp_ms
from backend.models.schemas import TaskResult
from backend.models.task_message import TaskMessageParams, validate_task_message

TASK_HISTORY_STATUSES = tuple(
    status for status in TASK_STATUSES if task_persistence_scope(status) == "history"
)
_IMMUTABLE_TASK_FIELDS = {
    "id",
    "type",
    "task_source",
    "task_contract_version",
    "created_at",
}
_MUTABLE_TASK_FIELDS = set(Task.model_fields) - _IMMUTABLE_TASK_FIELDS


def _clamp_progress(value):
    try:
        return max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return value


def _json_safe(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, Path):
        return str(value)

    try:
        json.dumps(value)
        return value
    except TypeError:
        return json.loads(json.dumps(value, default=str))


def _json_payload(value: Any) -> Dict | None:
    if value is None:
        return None
    payload = _json_safe(value)
    if isinstance(payload, dict):
        return payload
    return {"value": payload}


class TaskRepository:
    async def trim_history(self) -> list[str]:
        async with get_session_context() as session:
            pruned_task_ids = await self._trim_history(session)
            if pruned_task_ids:
                await session.commit()
        return pruned_task_ids

    async def _trim_history(self, session) -> list[str]:
        history_limit = settings.TASK_HISTORY_LIMIT
        statement = (
            select(Task.id)
            .where(Task.status.in_(TASK_HISTORY_STATUSES))
            .order_by(Task.created_at.desc(), Task.id.desc())
            .offset(history_limit)
        )
        result = await session.execute(statement)
        pruned_task_ids = list(result.scalars().all())
        if pruned_task_ids:
            await session.execute(delete(Task).where(Task.id.in_(pruned_task_ids)))
            logger.info(
                "Pruned {} task history records beyond configured limit {}.",
                len(pruned_task_ids),
                history_limit,
            )
        return pruned_task_ids

    async def load_runtime_tasks(self) -> dict[str, Task]:
        tasks_by_id: dict[str, Task] = {}
        async with get_session_context() as session:
            statement = select(Task).where(Task.status.in_(["running", "pending", "paused"]))
            result = await session.execute(statement)
            tasks = result.scalars().all()

            for task in tasks:
                if task.status in ["running", "pending"]:
                    task.status = "paused"
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

    async def load_history(self) -> dict[str, Task]:
        tasks_by_id: dict[str, Task] = {}
        async with get_session_context() as session:
            pruned_task_ids = await self._trim_history(session)
            if pruned_task_ids:
                await session.commit()

            statement = (
                select(Task)
                .where(Task.status.in_(TASK_HISTORY_STATUSES))
                .order_by(Task.created_at.desc(), Task.id.desc())
                .limit(settings.TASK_HISTORY_LIMIT)
            )
            result = await session.execute(statement)
            tasks = result.scalars().all()
            for task in tasks:
                tasks_by_id[task.id] = task
        return tasks_by_id

    async def create_task(
        self,
        task_type: str,
        initial_message_code: str = "queued",
        initial_message_params: TaskMessageParams | None = None,
        request_params: Dict | None = None,
        task_name: str | None = None,
    ) -> Task:
        task_id = str(uuid.uuid4())
        final_name = task_name or f"{task_type.capitalize()} {task_id}"

        if request_params:
            try:
                request_params = _json_payload(request_params)
            except Exception as e:
                logger.warning(f"Failed to serialize request_params: {e}")
                request_params = {}

        message_code, message_params = validate_task_message(
            initial_message_code,
            initial_message_params,
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
            created_at=task_timestamp_ms(),
            request_params=request_params,
        )

        async with get_session_context() as session:
            session.add(new_task)
            await session.commit()
            await session.refresh(new_task)

        return new_task

    async def update_task(self, task_id: str, cached_task: Optional[Task] = None, **kwargs) -> Task | None:
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
                if incoming_status is not None:
                    kwargs["persistence_scope"] = task_persistence_scope(str(incoming_status))
                    kwargs["lifecycle"] = task_lifecycle(str(incoming_status))
                for key, value in kwargs.items():
                    setattr(db_task, key, value)

                session.add(db_task)
                await session.commit()
                await session.refresh(db_task)
                updated_task = db_task
            else:
                logger.warning(f"Task {task_id} not found in DB during update.")
                if not cached_task:
                    return None
                for key, value in kwargs.items():
                    setattr(cached_task, key, value)
                updated_task = cached_task

        return updated_task

    async def delete_task(self, task_id: str) -> bool:
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if not db_task:
                return False
            await session.delete(db_task)
            await session.commit()
            return True

    async def delete_all_tasks(self) -> int:
        count = 0
        async with get_session_context() as session:
            statement = select(Task)
            result = await session.execute(statement)
            tasks = result.scalars().all()
            count = len(tasks)

            if count > 0:
                delete_statement = delete(Task)
                await session.execute(delete_statement)
                await session.commit()

        return count

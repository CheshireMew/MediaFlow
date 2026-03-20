import json
import time
import uuid
from typing import Dict, Optional

from loguru import logger
from sqlmodel import delete, select

from backend.core.database import get_session_context
from backend.models.task_model import Task


class TaskRepository:
    async def load_all(self) -> dict[str, Task]:
        tasks_by_id: dict[str, Task] = {}
        async with get_session_context() as session:
            statement = select(Task)
            result = await session.execute(statement)
            tasks = result.scalars().all()

            for task in tasks:
                if task.status in ["running", "pending"]:
                    task.status = "paused"
                    task.message = "Interrupted by restart"
                    task.cancelled = False
                    session.add(task)
                tasks_by_id[task.id] = task

            if tasks:
                await session.commit()

        return tasks_by_id

    async def create_task(
        self,
        task_type: str,
        initial_message: str = "Pending...",
        request_params: Dict | None = None,
        task_name: str | None = None,
    ) -> Task:
        task_id = str(uuid.uuid4())[:8]
        final_name = task_name or f"{task_type.capitalize()} {task_id}"

        if request_params:
            try:
                if hasattr(request_params, "model_dump"):
                    request_params = request_params.model_dump(mode="json")
                request_params = json.loads(json.dumps(request_params, default=str))
            except Exception as e:
                logger.warning(f"Failed to serialize request_params: {e}")
                request_params = {}

        new_task = Task(
            id=task_id,
            name=final_name,
            type=task_type,
            status="pending",
            message=initial_message,
            created_at=time.time(),
            request_params=request_params,
        )

        async with get_session_context() as session:
            session.add(new_task)
            await session.commit()
            await session.refresh(new_task)

        return new_task

    async def update_task(self, task_id: str, cached_task: Optional[Task] = None, **kwargs) -> Task | None:
        updated_task = None
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                incoming_status = kwargs.get("status")
                if db_task.status in {"completed", "failed", "cancelled", "paused"} and incoming_status is None:
                    return None
                for key, value in kwargs.items():
                    if hasattr(db_task, key):
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
                    if hasattr(cached_task, key):
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

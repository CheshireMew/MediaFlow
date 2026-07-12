
import argparse
import asyncio
import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.core.database import get_session_context
from backend.models.task_model import Task


async def check_task(task_id: str) -> None:
    async with get_session_context() as session:
        task = await session.get(Task, task_id)
        if task:
            print(f"Task ID: {task.id}")
            print(f"Name: {task.name}")
            print(f"Status: {task.status}")
            print(f"Progress: {task.progress}")
            print(f"Message code: {task.message_code}")
            print(f"Message params: {task.message_params}")
            print(f"Result: {task.result}")
            print(f"Error: {task.error}")
        else:
            print(f"Task {task_id} not found.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect one MediaFlow task.")
    parser.add_argument("task_id")
    args = parser.parse_args()
    asyncio.run(check_task(args.task_id))

import asyncio
import uuid
import time
import json
from typing import Dict, List, Optional, Any
from fastapi import WebSocket
from loguru import logger
from sqlmodel import select, delete

from src.core.database import get_session_context, init_db
from src.models.task_model import Task

class TaskManager:
    def __init__(self):
        self.tasks: Dict[str, Task] = {}
        self.active_connections: List[WebSocket] = []
        
    async def init_async(self):
        """Initialize DB and load tasks."""
        await init_db()
        await self.load_tasks()

    async def load_tasks(self):
        """Load tasks from DB on startup."""
        try:
            async with get_session_context() as session:
                statement = select(Task)
                result = await session.execute(statement)
                tasks = result.scalars().all()
                
                self.tasks.clear()
                for task in tasks:
                    # Mark any 'running' tasks as 'paused' since service restarted
                    if task.status in ["running", "pending"]:
                        task.status = "paused"
                        task.message = "Interrupted by restart"
                        task.cancelled = True 
                        session.add(task)
                    
                    self.tasks[task.id] = task
                
                if tasks:
                    await session.commit()
                    # Refresh all to ensure we have clean state if needed, though they are detached now
                    
            logger.info(f"Loaded {len(self.tasks)} tasks from SQLite.")
        except Exception as e:
            logger.error(f"Failed to load tasks from DB: {e}")

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")
        await self.send_tasks_snapshot(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.append(connection)
        
        for connection in disconnected:
            self.disconnect(connection)

    async def send_tasks_snapshot(self, websocket: WebSocket):
        """Send all current tasks to a specific client."""
        tasks_list = [task.model_dump(mode='json') for task in self.tasks.values()]
        try:
            await websocket.send_json({
                "type": "snapshot",
                "tasks": tasks_list
            })
        except Exception as e:
            logger.error(f"Error sending snapshot: {repr(e)}")
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                 raise e

    async def create_task(self, task_type: str, initial_message: str = "Pending...", request_params: Dict = None, task_name: str = None) -> str:
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
            request_params=request_params
        )
        
        # DB First
        async with get_session_context() as session:
            session.add(new_task)
            await session.commit()
            await session.refresh(new_task)
            
            # Update Cache
            self.tasks[task_id] = new_task
        
        # Broadcast
        await self.broadcast({
            "type": "update",
            "task": new_task.model_dump(mode='json')
        })
        
        return task_id

    async def update_task(self, task_id: str, **kwargs):
        # 1. DB Read-Modify-Write
        updated_task = None
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                for key, value in kwargs.items():
                    if hasattr(db_task, key):
                        setattr(db_task, key, value)
                
                session.add(db_task)
                await session.commit()
                await session.refresh(db_task)
                updated_task = db_task
            else:
                logger.warning(f"Task {task_id} not found in DB during update.")
                return

        # 2. Update Cache
        if updated_task:
            self.tasks[task_id] = updated_task
            
            # 3. Broadcast
            await self.broadcast({
                "type": "update",
                "task": updated_task.model_dump(mode='json')
            })

    async def cancel_task(self, task_id: str):
        updated_task = None
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                db_task.cancelled = True
                db_task.status = "cancelled"
                session.add(db_task)
                await session.commit()
                await session.refresh(db_task)
                updated_task = db_task

        if updated_task:
            self.tasks[task_id] = updated_task
            logger.info(f"Task {task_id} marked for cancellation")
            await self.broadcast({"type": "update", "task": updated_task.model_dump(mode='json')})

    async def delete_task(self, task_id: str) -> bool:
        task_exists = False
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                task_exists = True
                # If running, we should ideally cancel first, but this is delete
                await session.delete(db_task)
                await session.commit()

        if task_exists:
            # Remove from Memory
            if task_id in self.tasks:
                del self.tasks[task_id]
            
            await self.broadcast({
                "type": "delete",
                "task_id": task_id
            })
            logger.info(f"Task {task_id} deleted")
            return True
        return False
    
    async def delete_all_tasks(self) -> int:
        count = 0
        async with get_session_context() as session:
            # Count first
            statement = select(Task)
            result = await session.execute(statement)
            tasks = result.scalars().all()
            count = len(tasks)
            
            if count > 0:
                delete_statement = delete(Task)
                await session.execute(delete_statement)
                await session.commit()

        self.tasks.clear()
        
        await self.broadcast({
             "type": "snapshot", 
             "tasks": []
        })
        logger.info(f"Deleted all {count} tasks")
        return count
    
    async def cancel_all_tasks(self):
        cancelled_count = 0
        async with get_session_context() as session:
            statement = select(Task).where(Task.status.in_(["pending", "running"])).where(Task.cancelled == False)
            result = await session.execute(statement)
            tasks_to_cancel = result.scalars().all()
            
            for task in tasks_to_cancel:
                task.cancelled = True
                task.status = "cancelled"
                session.add(task)
                cancelled_count += 1
            
            if cancelled_count > 0:
                await session.commit()
                # Refresh cache for all modified tasks
                # Re-fetch or iterate
                for task in tasks_to_cancel:
                     # Since we still have the object attached to session or refreshed
                     # We can update cache
                     self.tasks[task.id] = task

        if cancelled_count > 0:
            logger.info(f"Marked {cancelled_count} tasks for cancellation")
            await self.broadcast({
                 "type": "snapshot", 
                 "tasks": [t.model_dump(mode='json') for t in self.tasks.values()]
            })
        return cancelled_count

    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)

    def is_cancelled(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        return task.cancelled if task else False

    def find_task_by_params(self, task_type: str, request_params: Dict[str, Any]) -> Optional[str]:
        if not request_params:
            return None
            
        def get_comparison_key(params: Dict) -> str:
            if 'steps' in params:
                 try:
                     for step in params['steps']:
                         if step['step_name'] == 'download' and 'url' in step['params']:
                             return step['params']['url']
                 except:
                     pass
            elif 'url' in params:
                return params['url']
            return json.dumps(params, sort_keys=True)

        target_key = get_comparison_key(request_params)
        
        for task in self.tasks.values():
            if task.type != task_type:
                continue
            if not task.request_params:
                continue
            current_key = get_comparison_key(task.request_params)
            if current_key == target_key:
                return task.id
        return None

    async def reset_task(self, task_id: str):
        updated_task = None
        async with get_session_context() as session:
            db_task = await session.get(Task, task_id)
            if db_task:
                db_task.status = "pending"
                db_task.progress = 0.0
                db_task.message = "Resuming..."
                db_task.created_at = time.time()
                db_task.result = None
                db_task.error = None
                db_task.cancelled = False
                session.add(db_task)
                await session.commit()
                await session.refresh(db_task)
                updated_task = db_task

        if updated_task:
            self.tasks[task_id] = updated_task
            await self.broadcast({
                "type": "update",
                "task": updated_task.model_dump(mode='json')
            })
            logger.info(f"Task {task_id} reset for reuse")



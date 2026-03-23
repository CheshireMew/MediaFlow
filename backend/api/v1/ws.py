from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.runtime_access import RuntimeServices

router = APIRouter(prefix="/ws", tags=["WebSocket"])


@router.websocket("/tasks")
async def websocket_endpoint(websocket: WebSocket):
    from loguru import logger
    notifier = RuntimeServices.ws_notifier()
    tm = RuntimeServices.task_manager()
    try:
        await notifier.connect(websocket)
        
        # Snapshot generation might fail if DB/serialization has issues
        try:
            snapshot = tm.get_tasks_snapshot()
            await notifier.send_snapshot(websocket, snapshot)
        except Exception as e:
            logger.error(f"Failed to send initial snapshot: {e}")
            # Don't close connection, just log error? 
            # If snapshot fails, maybe we still want live updates?
            # But likely something is fundamentally wrong.
            raise e

        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            task_id = data.get("task_id")
            if not task_id:
                continue
            if action == "pause":
                await tm.pause_task(task_id)
            elif action == "cancel":
                await tm.cancel_task(task_id)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected normally")
        notifier.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        # Ensure we try to disconnect cleanly if possible
        try:
            notifier.disconnect(websocket)
        except Exception:
            pass


from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.core.container import container, Services

router = APIRouter(prefix="/ws", tags=["WebSocket"])


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


@router.websocket("/tasks")
async def websocket_endpoint(websocket: WebSocket):
    tm = _get_task_manager()
    await tm.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle incoming messages (e.g. cancel requests)
            data = await websocket.receive_json()
            # Handle client messages if needed
            if data.get("action") == "cancel":
                task_id = data.get("task_id")
                if task_id:
                    await tm.cancel_task(task_id)
    except WebSocketDisconnect:
        tm.disconnect(websocket)
    except Exception:  # Handle other disconnect scenarios
        tm.disconnect(websocket)

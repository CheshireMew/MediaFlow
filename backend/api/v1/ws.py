from fastapi import APIRouter, WebSocket, WebSocketDisconnect


def create_router(*, notifier, task_manager) -> APIRouter:
    router = APIRouter(prefix="/ws", tags=["WebSocket"])

    @router.websocket("/tasks")
    async def websocket_endpoint(websocket: WebSocket):
        from loguru import logger

        try:
            await notifier.connect(websocket)
            try:
                await task_manager.ensure_started_async()
                await notifier.send_snapshot(
                    websocket,
                    task_manager.get_tasks_snapshot,
                )
            except Exception as e:
                logger.error(f"Failed to send initial snapshot: {e}")
                raise

            while True:
                data = await websocket.receive_json()
                action = data.get("action")
                task_id = data.get("task_id")
                if not task_id:
                    continue
                if action == "pause":
                    await task_manager.pause_task(task_id)
                elif action == "cancel":
                    await task_manager.cancel_task(task_id)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected normally")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            notifier.disconnect(websocket)

    return router

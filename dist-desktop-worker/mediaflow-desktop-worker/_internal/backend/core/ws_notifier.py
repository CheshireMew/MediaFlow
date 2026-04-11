"""
WebSocket connection management and broadcast.

Separated from TaskManager (Issue #4) to follow Single Responsibility:
  - TaskManager: task CRUD + DB persistence
  - WebSocketNotifier: connection lifecycle + push notifications
"""

from typing import List
from fastapi import WebSocket
from loguru import logger


class WebSocketNotifier:
    """Manages WebSocket connections and broadcasts task updates."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

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

    async def send_snapshot(self, websocket: WebSocket, tasks_data: list):
        """Send all current tasks to a specific client (initial sync)."""
        try:
            await websocket.send_json({
                "type": "snapshot",
                "tasks": tasks_data,
            })
        except Exception as e:
            logger.error(f"Error sending snapshot: {repr(e)}")
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                raise

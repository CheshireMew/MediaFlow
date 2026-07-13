"""
WebSocket connection management and broadcast.

Separated from TaskManager (Issue #4) to follow Single Responsibility:
  - TaskManager: task CRUD + DB persistence
  - WebSocketNotifier: connection lifecycle + push notifications
"""

import asyncio
from uuid import uuid4
from collections.abc import Callable
from typing import List
from fastapi import WebSocket
from loguru import logger

from backend.models.schemas import TaskView

WEBSOCKET_SEND_TIMEOUT_SECONDS = 2.0


class WebSocketNotifier:
    """Manages WebSocket connections and broadcasts task updates."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._send_lock = asyncio.Lock()
        self._stream_id = uuid4().hex
        self._sequence = 0

    def _envelope(self, message: dict) -> dict:
        self._sequence += 1
        return {
            **message,
            "stream_id": self._stream_id,
            "sequence": self._sequence,
        }

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
        async with self._send_lock:
            envelope = self._envelope(message)
            connections = list(self.active_connections)

            async def send(connection: WebSocket) -> WebSocket | None:
                try:
                    await asyncio.wait_for(
                        connection.send_json(envelope),
                        timeout=WEBSOCKET_SEND_TIMEOUT_SECONDS,
                    )
                    return None
                except Exception as e:
                    logger.warning(f"Failed to send to client: {e}")
                    return connection

            if connections:
                disconnected = await asyncio.gather(
                    *(send(connection) for connection in connections)
                )
                for connection in disconnected:
                    if connection is not None:
                        self.disconnect(connection)

    async def send_snapshot(
        self,
        websocket: WebSocket,
        snapshot_factory: Callable[[], list[TaskView]],
    ):
        """Send all current tasks to a specific client (initial sync)."""
        try:
            async with self._send_lock:
                tasks_data = snapshot_factory()
                await asyncio.wait_for(
                    websocket.send_json(
                        self._envelope(
                            {
                                "type": "snapshot",
                                "tasks": [
                                    task.model_dump(mode="json") for task in tasks_data
                                ],
                            }
                        )
                    ),
                    timeout=WEBSOCKET_SEND_TIMEOUT_SECONDS,
                )
        except Exception as e:
            logger.error(f"Error sending snapshot: {repr(e)}")
            raise

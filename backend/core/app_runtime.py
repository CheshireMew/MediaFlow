import json
from loguru import logger

from backend.config import settings
from backend.core.container import Services
from backend.core.database import shutdown_db
from backend.core.service_registry import register_all_services
from backend.core.tasks.registry import (
    register_all_task_handlers,
    validate_required_task_handlers,
)


class ApplicationRuntime:
    def __init__(self, container):
        self._container = container

    def register_services(self) -> int:
        return register_all_services(self._container)

    def register_task_handlers(self) -> None:
        register_all_task_handlers()
        validate_required_task_handlers()

    async def start(self) -> int:
        registered_count = self.register_services()
        self.register_task_handlers()
        await self._container.get(Services.TASK_MANAGER).warm_start_async()
        return registered_count

    async def stop(self) -> None:
        if self._container.is_instantiated(Services.TASK_MANAGER):
            await self._container.get(Services.TASK_MANAGER).shutdown_async()
        if self._container.is_instantiated(Services.BROWSER):
            await self._container.get(Services.BROWSER).stop()
        await shutdown_db()
        self._container.reset()


def write_server_config() -> None:
    server_config = {
        "base_url": f"http://{settings.HOST}:{settings.PORT}/api/v1",
        "ws_url": f"ws://{settings.HOST}:{settings.PORT}/api/v1",
        "port": settings.PORT,
    }
    config_path = settings.USER_DATA_DIR / "server.json"
    with open(config_path, "w", encoding="utf-8") as file:
        json.dump(server_config, file, indent=2)
    logger.info(f"Wrote server config to {config_path}")

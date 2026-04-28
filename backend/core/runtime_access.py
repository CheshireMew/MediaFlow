import asyncio
from collections.abc import Callable
from typing import Any

from backend.core.container import Services, container

_runtime_container = None


def configure_runtime_services(service_container) -> None:
    global _runtime_container
    _runtime_container = service_container


def reset_runtime_services() -> None:
    global _runtime_container
    _runtime_container = None


def _get_runtime_container():
    return _runtime_container or container


class RuntimeServices:
    """Single access point for runtime services used by task execution flows."""

    @staticmethod
    def task_manager():
        return _get_runtime_container().get(Services.TASK_MANAGER)

    @staticmethod
    def pipeline_runner():
        return _get_runtime_container().get(Services.PIPELINE)

    @staticmethod
    def task_orchestrator():
        return _get_runtime_container().get(Services.TASK_ORCHESTRATOR)

    @staticmethod
    def asr():
        return _get_runtime_container().get(Services.ASR)

    @staticmethod
    def downloader():
        return _get_runtime_container().get(Services.DOWNLOADER)

    @staticmethod
    def translator():
        return _get_runtime_container().get(Services.LLM_TRANSLATOR)

    @staticmethod
    def synthesis():
        return _get_runtime_container().get(Services.VIDEO_SYNTHESIS)

    @staticmethod
    def enhancer():
        return _get_runtime_container().get(Services.ENHANCER)

    @staticmethod
    def cleaner():
        return _get_runtime_container().get(Services.CLEANER)

    @staticmethod
    def analyzer():
        return _get_runtime_container().get(Services.ANALYZER)

    @staticmethod
    def ws_notifier():
        return _get_runtime_container().get(Services.WS_NOTIFIER)

    @staticmethod
    def settings_manager():
        return _get_runtime_container().get(Services.SETTINGS_MANAGER)

    @staticmethod
    def glossary():
        return _get_runtime_container().get(Services.GLOSSARY)

    @staticmethod
    def cookie_manager():
        return _get_runtime_container().get(Services.COOKIE_MANAGER)

    @staticmethod
    def browser():
        return _get_runtime_container().get(Services.BROWSER)

    @staticmethod
    def sniffer():
        return _get_runtime_container().get(Services.SNIFFER)


class TaskRuntimeContext:
    """Owns task-state mutation, control checks, and executor bridging."""

    def __init__(self, task_id: str | None, *, task_manager, loop=None):
        self.task_id = task_id
        self.task_manager = task_manager
        self.loop = loop or asyncio.get_running_loop()

    @classmethod
    def for_task(cls, task_id: str | None, *, task_manager=None) -> "TaskRuntimeContext":
        return cls(
            task_id,
            task_manager=task_manager or RuntimeServices.task_manager(),
        )

    def checkpoint(self) -> None:
        if self.task_id:
            self.task_manager.raise_if_control_requested(self.task_id)

    async def update(self, **kwargs) -> None:
        if self.task_id:
            await self.task_manager.update_task(self.task_id, **kwargs)

    async def mark_controlled_stop(self, request: str, message: str | None = None) -> None:
        if self.task_id:
            await self.task_manager.mark_controlled_stop(
                self.task_id,
                request,
                message,
            )

    def get_stop_request(self) -> str | None:
        if not self.task_id:
            return None
        return self.task_manager.get_stop_request(self.task_id)

    def submit_progress(self, progress: float, message: str) -> None:
        if not self.task_id:
            return
        self.checkpoint()
        if self.loop.is_closed():
            return
        self.task_manager.submit_threadsafe_update(
            self.loop,
            self.task_id,
            progress=progress,
            message=message,
        )

    def build_progress_callback(
        self,
        *,
        progress_transform: Callable[[Any], float] | None = None,
    ) -> Callable[[Any, str], None]:
        transform = progress_transform or float

        def _callback(progress: Any, message: str) -> None:
            self.submit_progress(transform(progress), message)

        return _callback

    async def run_blocking(self, worker: Callable[[], Any]) -> Any:
        return await self.loop.run_in_executor(None, worker)

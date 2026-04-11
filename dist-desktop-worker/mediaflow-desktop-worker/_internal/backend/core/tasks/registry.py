from importlib import import_module
from typing import Dict, Type, Optional
from backend.config import settings
from backend.core.tasks.base import TaskHandler
from loguru import logger


HANDLER_MODULES = [
    "backend.core.tasks.handlers.transcribe_handler",
    "backend.core.tasks.handlers.synthesis_handler",
    "backend.core.tasks.handlers.pipeline_handler",
    "backend.core.tasks.handlers.translate_handler",
    "backend.core.tasks.handlers.download_handler",
    "backend.core.tasks.handlers.transcribe_segment_handler",
    "backend.core.tasks.handlers.ocr_handler",
]

if settings.ENABLE_EXPERIMENTAL_PREPROCESSING:
    HANDLER_MODULES.append("backend.core.tasks.handlers.preprocessing_handler")

REQUIRED_TASK_TYPES = {
    "transcribe",
    "synthesis",
    "pipeline",
    "translate",
    "download",
    "transcribe_segment",
    "extract",
}

if settings.ENABLE_EXPERIMENTAL_PREPROCESSING:
    REQUIRED_TASK_TYPES.update({"enhancement", "cleanup"})

class TaskHandlerRegistry:
    """
    Registry for TaskHandlers.
    Allows handlers to register themselves for specific task types.
    """
    _handlers: Dict[str, Type[TaskHandler]] = {}

    @classmethod
    def register(cls, task_type: str):
        """Decorator to register a handler for a task type."""
        def decorator(handler_cls: Type[TaskHandler]):
            if task_type in cls._handlers and cls._handlers[task_type] is not handler_cls:
                raise RuntimeError(f"TaskHandler already registered for '{task_type}'")
            cls._handlers[task_type] = handler_cls
            logger.debug(f"Registered TaskHandler for '{task_type}': {handler_cls.__name__}")
            return handler_cls
        return decorator

    @classmethod
    def get(cls, task_type: str) -> Optional[TaskHandler]:
        """Get an instantiated handler for the given task type."""
        handler_cls = cls._handlers.get(task_type)
        if not handler_cls:
            return None
        return handler_cls()

    @classmethod
    def clear(cls) -> None:
        cls._handlers.clear()

    @classmethod
    def registered_types(cls) -> set[str]:
        return set(cls._handlers.keys())


def register_all_task_handlers() -> None:
    for module_path in HANDLER_MODULES:
        import_module(module_path)


def validate_required_task_handlers() -> None:
    missing = REQUIRED_TASK_TYPES - TaskHandlerRegistry.registered_types()
    if missing:
        raise RuntimeError(
            f"Missing task handlers for: {', '.join(sorted(missing))}"
        )

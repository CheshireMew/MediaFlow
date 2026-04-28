"""
Service Container - lightweight dependency injection for MediaFlow.
Provides centralized service registration and lazy instantiation.
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, TypeVar
from loguru import logger

T = TypeVar('T')


@dataclass(frozen=True)
class ServiceKey:
    name: str

    def __str__(self) -> str:
        return self.name


def _service_name(key: "ServiceKey | str") -> str:
    return key.name if isinstance(key, ServiceKey) else key


class ServiceContainer:
    """
    Lightweight dependency injection container.

    Features:
    - Lazy instantiation (services created on first access)
    - Singleton lifecycle (one instance per service)
    - Override support for testing

    Usage:
        assembly = build_service_assembly()
        assembly.register_into(container)
        task_manager = container.get(Services.TASK_MANAGER)
    """

    def __init__(self):
        self._factories: Dict[str, Callable[[], Any]] = {}
        self._instances: Dict[str, Any] = {}

    def register(self, name: "ServiceKey | str", factory: Callable[[], T]) -> None:
        """
        Register a service factory function.

        Args:
            name: Service key declared by the assembly/runtime boundary
            factory: Callable that creates the service instance
        """
        service_name = _service_name(name)
        if service_name in self._factories:
            existing_factory = self._factories[service_name]
            if existing_factory is factory:
                logger.warning(f"[Container] Duplicate registration ignored for service: {service_name}")
                return
            raise RuntimeError(f"Service '{service_name}' already registered")

        self._factories[service_name] = factory
        logger.debug(f"[Container] Registered service: {service_name}")

    def get(self, name: "ServiceKey | str") -> Any:
        """
        Get or create a service instance (singleton pattern).

        Args:
            name: Service key declared by the assembly/runtime boundary

        Returns:
            The service instance

        Raises:
            KeyError: If service not registered
        """
        service_name = _service_name(name)
        if service_name not in self._instances:
            if service_name not in self._factories:
                raise KeyError(f"Service '{service_name}' not registered. "
                             f"Available: {list(self._factories.keys())}")
            self._instances[service_name] = self._factories[service_name]()
            logger.debug(f"[Container] Instantiated service: {service_name}")
        return self._instances[service_name]

    def has(self, name: "ServiceKey | str") -> bool:
        """Check if a service is registered."""
        return _service_name(name) in self._factories

    def is_instantiated(self, name: "ServiceKey | str") -> bool:
        """Check if a service instance has already been created."""
        return _service_name(name) in self._instances
    
    def reset(self) -> None:
        """
        Reset all instances (for testing or shutdown).
        Factories remain registered.
        """
        self._instances.clear()
        logger.debug("[Container] All service instances cleared")

    def clear(self) -> None:
        """Clear all factories and instances. Intended for tests/bootstrap reset."""
        self._factories.clear()
        self._instances.clear()
        logger.debug("[Container] Cleared all factories and instances")
    
    def override(self, name: "ServiceKey | str", instance: Any) -> None:
        """
        Override a service with a custom instance (for testing/mocking).

        Args:
            name: Service key declared by the assembly/runtime boundary
            instance: The mock/custom instance to use
        """
        service_name = _service_name(name)
        self._instances[service_name] = instance
        logger.debug(f"[Container] Overrode service: {service_name}")


# Global container instance
container = ServiceContainer()


# Service keys shared by assembly and runtime access.
class Services:
    TASK_MANAGER = ServiceKey("task_manager")
    TASK_ORCHESTRATOR = ServiceKey("task_orchestrator")
    TASK_REQUEST_DEDUPLICATOR = ServiceKey("task_request_deduplicator")
    TASK_RESUME_SERVICE = ServiceKey("task_resume_service")
    DOWNLOAD_WORKFLOW = ServiceKey("download_workflow")
    TRANSCRIBER_WORKFLOW = ServiceKey("transcriber_workflow")
    WS_NOTIFIER = ServiceKey("ws_notifier")
    ASR = ServiceKey("asr")
    DOWNLOADER = ServiceKey("downloader")
    LLM_TRANSLATOR = ServiceKey("llm_translator")
    BROWSER = ServiceKey("browser")
    SNIFFER = ServiceKey("sniffer")
    SETTINGS_MANAGER = ServiceKey("settings_manager")
    GLOSSARY = ServiceKey("glossary")
    COOKIE_MANAGER = ServiceKey("cookie_manager")
    ANALYZER = ServiceKey("analyzer")
    PLATFORM_FACTORY = ServiceKey("platform_factory")
    PIPELINE = ServiceKey("pipeline")
    VIDEO_SYNTHESIS = ServiceKey("video_synthesis")
    ENHANCER = ServiceKey("enhancer")
    CLEANER = ServiceKey("cleaner")

"""
Service Container - Lightweight dependency injection for MediaFlow.
Provides centralized service registration and lazy instantiation.
"""
from typing import Dict, Any, Callable, TypeVar
from loguru import logger

T = TypeVar('T')


class ServiceContainer:
    """
    Lightweight dependency injection container.
    
    Features:
    - Lazy instantiation (services created on first access)
    - Singleton lifecycle (one instance per service)
    - Override support for testing
    
    Usage:
        container.register("task_manager", TaskManager)
        tm = container.get("task_manager")  # Creates instance on first call
    """
    
    def __init__(self):
        self._factories: Dict[str, Callable[[], Any]] = {}
        self._instances: Dict[str, Any] = {}
    
    def register(self, name: str, factory: Callable[[], T]) -> None:
        """
        Register a service factory function.
        
        Args:
            name: Service identifier (e.g., "task_manager")
            factory: Callable that creates the service instance
        """
        self._factories[name] = factory
        logger.debug(f"[Container] Registered service: {name}")
    
    def get(self, name: str) -> Any:
        """
        Get or create a service instance (singleton pattern).
        
        Args:
            name: Service identifier
            
        Returns:
            The service instance
            
        Raises:
            KeyError: If service not registered
        """
        if name not in self._instances:
            if name not in self._factories:
                raise KeyError(f"Service '{name}' not registered. "
                             f"Available: {list(self._factories.keys())}")
            self._instances[name] = self._factories[name]()
            logger.debug(f"[Container] Instantiated service: {name}")
        return self._instances[name]
    
    def has(self, name: str) -> bool:
        """Check if a service is registered."""
        return name in self._factories
    
    def reset(self) -> None:
        """
        Reset all instances (for testing or shutdown).
        Factories remain registered.
        """
        self._instances.clear()
        logger.debug("[Container] All service instances cleared")
    
    def override(self, name: str, instance: Any) -> None:
        """
        Override a service with a custom instance (for testing/mocking).
        
        Args:
            name: Service identifier
            instance: The mock/custom instance to use
        """
        self._instances[name] = instance
        logger.debug(f"[Container] Overrode service: {name}")


# Global container instance
container = ServiceContainer()


# Service name constants (prevents typos)
class Services:
    TASK_MANAGER = "task_manager"
    ASR = "asr"
    DOWNLOADER = "downloader"
    LLM_TRANSLATOR = "llm_translator"
    BROWSER = "browser"
    SNIFFER = "sniffer"
    SETTINGS_MANAGER = "settings_manager"
    GLOSSARY = "glossary"
    COOKIE_MANAGER = "cookie_manager"
    ANALYZER = "analyzer"
    PIPELINE = "pipeline"
    VIDEO_SYNTHESIZER = "video_synthesizer"

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from backend.models.task_model import Task

class TaskHandler(ABC):
    """
    Abstract base class for all task handlers.
    Each handler is responsible for rebuilding a runnable task coroutine.
    """
    
    @abstractmethod
    def build_runner(self, task: Task) -> Callable[[], Awaitable[None]]:
        """
        Build the async runner used by the in-memory task queue.
        
        Args:
            task: The task model containing request parameters and state.
        """
        pass

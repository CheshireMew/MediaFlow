from abc import ABC, abstractmethod
from typing import Any
from backend.core.context import PipelineContext

class PipelineStep(ABC):
    """Abstract base class for all pipeline steps."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """The unique name of the step (e.g., 'download')."""
        pass

    @abstractmethod
    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        """
        Execute the step logic.
        :param ctx: Shared pipeline context
        :param params: Step-specific parameters
        :param task_id: (Optional) Task ID for reporting progress
        """
        pass

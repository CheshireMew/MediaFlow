from abc import ABC, abstractmethod
from typing import ClassVar, Literal

from backend.core.context import PipelineContext

ResumePolicy = Literal["idempotent", "replace_output", "atomic_publish"]
RESUME_POLICIES: frozenset[str] = frozenset(
    {"idempotent", "replace_output", "atomic_publish"}
)

class PipelineStep(ABC):
    """Abstract base class for all pipeline steps."""

    resume_policy: ClassVar[ResumePolicy]
    
    @property
    @abstractmethod
    def name(self) -> str:
        """The unique name of the step (e.g., 'download')."""

    @abstractmethod
    async def execute(self, ctx: PipelineContext, params: dict, task_id: str | None = None):
        """
        Execute the step logic.
        :param ctx: Shared pipeline context
        :param params: Step-specific parameters
        :param task_id: (Optional) Task ID for reporting progress
        """

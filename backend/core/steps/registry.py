from collections.abc import Iterable

from loguru import logger
from backend.core.steps.base import PipelineStep


class StepRegistry:
    def __init__(self, steps: Iterable[PipelineStep] = ()):
        self._steps: dict[str, PipelineStep] = {}
        for step in steps:
            self.register(step)

    def register(self, step: PipelineStep) -> None:
        """Register a new step instance."""
        if step.name in self._steps:
            raise RuntimeError(f"Pipeline step already registered: {step.name}")
        self._steps[step.name] = step
        logger.info(f"Registered pipeline step: {step.name}")

    def get_step(self, name: str) -> PipelineStep:
        """Retrieve a step by name."""
        step = self._steps.get(name)
        if not step:
            raise ValueError(f"Unknown pipeline step: '{name}'")
        return step

    def list_steps(self) -> list[str]:
        return list(self._steps)

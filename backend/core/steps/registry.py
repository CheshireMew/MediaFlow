from typing import Dict, Type
from loguru import logger
from backend.core.steps.base import PipelineStep

class StepRegistry:
    _steps: Dict[str, PipelineStep] = {}

    @classmethod
    def register(cls, step: PipelineStep):
        """Register a new step instance."""
        if step.name in cls._steps:
            logger.warning(f"Overwriting existing step: {step.name}")
        cls._steps[step.name] = step
        logger.info(f"Registered pipeline step: {step.name}")

    @classmethod
    def get_step(cls, name: str) -> PipelineStep:
        """Retrieve a step by name."""
        step = cls._steps.get(name)
        if not step:
            raise ValueError(f"Unknown pipeline step: '{name}'")
        return step

    @classmethod
    def list_steps(cls):
        return list(cls._steps.keys())

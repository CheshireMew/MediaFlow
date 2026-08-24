import pytest

from backend.application.pipeline_steps.base import PipelineStep
from backend.application.pipeline_steps.registry import StepRegistry
from backend.contracts import pipeline_step_names, task_types
from backend.models.pipeline_contracts import PIPELINE_STEP_PARAM_MODELS


class CatalogStep(PipelineStep):
    resume_policy = "replace_output"

    def __init__(self, name: str):
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    async def execute(self, ctx, params, task_id=None):
        return None


def test_pipeline_is_the_only_background_task_type():
    assert task_types() == {"pipeline"}


def test_step_registry_and_parameter_models_cover_the_step_catalog():
    registry = StepRegistry(CatalogStep(name) for name in pipeline_step_names())
    assert set(registry.list_steps()) == pipeline_step_names()
    assert set(PIPELINE_STEP_PARAM_MODELS) == pipeline_step_names()


def test_step_registry_rejects_steps_without_an_explicit_resume_policy():
    class MissingPolicyStep:
        name = "download"

    with pytest.raises(RuntimeError, match="resume policy"):
        StepRegistry([MissingPolicyStep()])

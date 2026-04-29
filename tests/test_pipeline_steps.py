"""
Standardized test for pipeline step registration.
Converted from tests/verify_auto_flow.py (Issue #7).

Verifies that all required pipeline steps (download, transcribe,
translate, synthesize) are properly registered in the StepRegistry.
"""

import pytest


def test_all_pipeline_steps_registered():
    """All required auto-execute flow steps must be registered."""
    from backend.core.steps.registry import StepRegistry
    # Trigger step module imports so decorators register the steps
    from backend.core.steps import download, transcribe, translate, synthesize  # noqa: F401

    registered = StepRegistry.list_steps()

    required = ["download", "transcribe", "translate", "synthesize"]
    missing = [s for s in required if s not in registered]

    assert not missing, f"Missing pipeline steps: {missing}. Registered: {registered}"


def test_step_registry_returns_step_class():
    """StepRegistry.get_step() must return a valid step class for known steps."""
    from backend.core.steps.registry import StepRegistry
    from backend.core.steps import download  # noqa: F401

    step_cls = StepRegistry.get_step("download")
    assert step_cls is not None, "StepRegistry.get_step('download') returned None"

"""
Standardized test for pipeline step registration.
Converted from tests/verify_auto_flow.py (Issue #7).

Verifies that all catalogued pipeline steps are registered in the StepRegistry.
"""

from backend.application.pipeline_steps.download import DownloadStep
from backend.application.pipeline_steps.clip_export import ClipExportStep
from backend.application.pipeline_steps.registry import StepRegistry
from backend.application.pipeline_steps.synthesize import SynthesizeStep
from backend.application.pipeline_steps.transcribe import TranscribeStep
from backend.application.pipeline_steps.translate import TranslateStep


def _registry() -> StepRegistry:
    dependency = object()
    return StepRegistry(
        [
            DownloadStep(downloader=dependency, task_manager=dependency),
            TranscribeStep(asr_service=dependency, task_manager=dependency),
            TranslateStep(translator=dependency, task_manager=dependency),
            SynthesizeStep(synthesis=dependency, task_manager=dependency),
            ClipExportStep(video_synthesis=dependency, task_manager=dependency),
        ]
    )


def test_all_pipeline_steps_registered():
    """All required auto-execute flow steps must be registered."""
    from backend.contracts import pipeline_step_names

    registered = _registry().list_steps()

    required = sorted(pipeline_step_names())
    missing = [s for s in required if s not in registered]

    assert not missing, f"Missing pipeline steps: {missing}. Registered: {registered}"


def test_step_registry_returns_step_class():
    """StepRegistry.get_step() must return a valid step class for known steps."""
    step_cls = _registry().get_step("download")
    assert step_cls is not None, "StepRegistry.get_step('download') returned None"

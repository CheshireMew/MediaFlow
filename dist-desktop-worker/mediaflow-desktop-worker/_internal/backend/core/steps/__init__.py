from backend.core.steps.registry import StepRegistry
from backend.core.steps.download import DownloadStep
from backend.core.steps.transcribe import TranscribeStep
from backend.core.steps.translate import TranslateStep
from backend.core.steps.synthesize import SynthesizeStep

# This ensures they are registered
__all__ = ["StepRegistry"]

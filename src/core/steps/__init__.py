from src.core.steps.registry import StepRegistry
from src.core.steps.download import DownloadStep
from src.core.steps.transcribe import TranscribeStep
from src.core.steps.translate import TranslateStep
from src.core.steps.synthesize import SynthesizeStep

# This ensures they are registered
__all__ = ["StepRegistry"]

import asyncio
from loguru import logger

from src.core.steps.base import PipelineStep
from src.core.steps.registry import StepRegistry
from src.core.context import PipelineContext
from src.core.container import container, Services


def _get_asr_service():
    return container.get(Services.ASR)


class TranscribeStep(PipelineStep):
    @property
    def name(self) -> str:
        return "transcribe"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # Try to get path from previous step or params
        audio_path = params.get("audio_path") or ctx.get("video_path")
        if not audio_path:
            raise ValueError("Transcribe step requires 'audio_path' (or result from download step)")
        
        model = params.get("model", "base")
        device = params.get("device", "cpu")
        language = params.get("language")
        initial_prompt = params.get("initial_prompt")
        
        # Also run transcribe in executor because it blocks!
        loop = asyncio.get_running_loop()
        asr_service = _get_asr_service()
        
        result = await loop.run_in_executor(
            None,
            lambda: asr_service.transcribe(
                audio_path=audio_path,
                model_name=model,
                device=device,
                language=language,
                initial_prompt=initial_prompt
            )
        )
        
        ctx.set("transcript", result.text)
        ctx.set("segments", result.segments)
        logger.success(f"Step Transcribe finished. Text len: {len(result.text)}")


# Register at module level
StepRegistry.register(TranscribeStep())

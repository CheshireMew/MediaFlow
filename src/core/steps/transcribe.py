import asyncio
from loguru import logger

from src.core.steps.base import PipelineStep
from src.core.steps.registry import StepRegistry
from src.core.context import PipelineContext
from src.core.container import container, Services


def _get_asr_service():
    return container.get(Services.ASR)


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


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
        tm = _get_task_manager()

        def progress_cb(percent, msg):
            if task_id:
                asyncio.run_coroutine_threadsafe(
                    tm.update_task(task_id, progress=percent, message=msg),
                    loop
                )
        
        result = await loop.run_in_executor(
            None,
            lambda: asr_service.transcribe(
                audio_path=audio_path,
                model_name=model,
                device=device,
                language=language,
                initial_prompt=initial_prompt,
                task_id=task_id,
                progress_callback=progress_cb
            )
        )
        
        if not result.success:
            raise Exception(result.error or "Transcription failed")

        text = result.meta.get("text", "")
        segments = result.meta.get("segments", [])

        ctx.set("transcript", text)
        ctx.set("segments", segments)
        
        # Extract SRT path
        srt_file = next((f for f in result.files if f.type == "subtitle"), None)
        if srt_file:
            ctx.set("srt_path", srt_file.path)
            
        # Ensure video_path is set for downstream steps (like Synthesize)
        # If we started here (not from download), video_path might be empty.
        if not ctx.get("video_path") and audio_path:
             ctx.set("video_path", audio_path)
             
        logger.success(f"Step Transcribe finished. Text len: {len(text)}")


# Register at module level
StepRegistry.register(TranscribeStep())

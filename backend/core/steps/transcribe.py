import asyncio
from loguru import logger

from backend.core.steps.base import PipelineStep
from backend.core.steps.registry import StepRegistry
from backend.core.context import PipelineContext
from backend.core.container import container, Services


class TranscribeStep(PipelineStep):
    @property
    def name(self) -> str:
        return "transcribe"

    async def execute(self, ctx: PipelineContext, params: dict, task_id: str = None):
        # Try to get path from previous step (download) or params
        audio_path = (
            ctx.get_media_path("audio_ref", "audio_path", "video_path")
            or params.get("audio_path")
            or (params.get("audio_ref") or {}).get("path")
        )
        if not audio_path:
            raise ValueError("Transcribe step requires 'audio_path' (or result from download step)")

        model = params.get("model", "base")
        device = params.get("device", "cpu")
        language = params.get("language")
        initial_prompt = params.get("initial_prompt")
        
        # Also run transcribe in executor because it blocks!
        loop = asyncio.get_running_loop()
        asr_service = container.get(Services.ASR)
        tm = container.get(Services.TASK_MANAGER)

        def progress_cb(percent, msg):
            if task_id:
                tm.raise_if_control_requested(task_id)
                tm.submit_threadsafe_update(
                    loop,
                    task_id,
                    progress=percent,
                    message=msg,
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
            if task_id:
                tm.raise_if_control_requested(task_id)
            raise Exception(result.error or "Transcription failed")

        text = result.meta.get("text", "")
        segments = result.meta.get("segments", [])
        detected_language = result.meta.get("language", language or "auto")

        ctx.set("text", text)
        ctx.set("transcript", text)
        ctx.set("language", detected_language)
        ctx.set("segments", segments)
        
        # Extract SRT path
        srt_file = next((f for f in result.files if f.type == "subtitle"), None)
        if srt_file:
            ctx.set_media(
                path_key="srt_path",
                ref_key="subtitle_ref",
                path=srt_file.path,
                media_type="application/x-subrip",
                mirror_path_keys=("subtitle_path",),
                extra_ref_keys=("context_ref", "output_ref"),
            )
            
        # Ensure video_path is set for downstream steps (like Synthesize)
        # If we started here (not from download), video_path might be empty.
        if not ctx.get("video_path") and audio_path:
             ctx.set_media(
                 path_key="video_path",
                 ref_key="video_ref",
                 path=audio_path,
                 media_type="video/mp4",
             )
             
        logger.success(f"Step Transcribe finished. Text len: {len(text)}")


# Register at module level
StepRegistry.register(TranscribeStep())

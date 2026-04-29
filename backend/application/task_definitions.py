from backend.application.ocr_service import run_ocr_task
from backend.application.preprocessing_service import (
    run_cleanup_task,
    run_enhancement_task,
)
from backend.application.synthesis_service import run_synthesis_task
from backend.application.transcription_service import (
    run_transcription_segment_task,
    run_transcription_task,
)
from backend.application.translation_service import run_translation_task
from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.core.tasks.registry import register_task_runner
from backend.models.schemas import (
    CleanRequest,
    EnhanceRequest,
    OCRExtractRequest,
    PipelineRequest,
    SynthesisRequest,
    TranscribeRequest,
    TranscribeSegmentRequest,
)
from backend.models.task_model import Task
from backend.application.translation_service import TranslationRequest


def _pipeline_runner(task: Task):
    request = PipelineRequest(**task.request_params)
    return lambda: runtime_service(Services.PIPELINE).run(request.steps, task.id)


def _transcription_runner(task: Task):
    request = TranscribeRequest(**task.request_params)
    return lambda: run_transcription_task(task.id, request)


def _transcription_segment_runner(task: Task):
    request = TranscribeSegmentRequest(**task.request_params)
    return lambda: run_transcription_segment_task(task.id, request)


def _translation_runner(task: Task):
    request = TranslationRequest(**task.request_params)
    return lambda: run_translation_task(task.id, request)


def _synthesis_runner(task: Task):
    request = SynthesisRequest(**task.request_params)
    return lambda: run_synthesis_task(task.id, request)


def _ocr_runner(task: Task):
    request = OCRExtractRequest(**task.request_params)
    return lambda: run_ocr_task(task.id, request)


def _enhancement_runner(task: Task):
    request = EnhanceRequest(**task.request_params)
    return lambda: run_enhancement_task(task.id, request)


def _cleanup_runner(task: Task):
    request = CleanRequest(**task.request_params)
    return lambda: run_cleanup_task(task.id, request)


register_task_runner("pipeline", _pipeline_runner)
register_task_runner("download", _pipeline_runner)
register_task_runner("transcribe", _transcription_runner)
register_task_runner("transcribe_segment", _transcription_segment_runner)
register_task_runner("translate", _translation_runner)
register_task_runner("synthesis", _synthesis_runner)
register_task_runner("extract", _ocr_runner)
register_task_runner("enhancement", _enhancement_runner)
register_task_runner("cleanup", _cleanup_runner)

"""
Declarative service assembly for runtime wiring.
"""

from collections.abc import Callable
from dataclasses import dataclass

from backend.core.container import Services
from backend.core.service_assembly import ServiceAssembly, ServiceProvider


def _create_pipeline_runner(container):
    from backend.core.pipeline import PipelineRunner

    return PipelineRunner(
        task_manager=container.get(Services.TASK_MANAGER),
        step_registry=container.get(Services.PIPELINE_STEPS),
    )


@dataclass(frozen=True)
class PipelineStepProvider:
    name: str
    build: Callable


def _build_download_step(container, task_manager):
    from backend.application.pipeline_steps.download import DownloadStep

    return DownloadStep(
        downloader=container.get(Services.DOWNLOADER),
        task_manager=task_manager,
    )


def _build_transcribe_step(container, task_manager):
    from backend.application.pipeline_steps.transcribe import TranscribeStep

    return TranscribeStep(
        asr_service=container.get(Services.ASR),
        task_manager=task_manager,
    )


def _build_translate_step(container, task_manager):
    from backend.application.pipeline_steps.translate import TranslateStep

    return TranslateStep(
        translator=container.get(Services.LLM_TRANSLATOR),
        task_manager=task_manager,
    )


def _build_synthesize_step(container, task_manager):
    from backend.application.pipeline_steps.synthesize import SynthesizeStep

    return SynthesizeStep(
        synthesis=container.get(Services.VIDEO_SYNTHESIS),
        task_manager=task_manager,
    )


def _build_clip_export_step(container, task_manager):
    from backend.application.pipeline_steps.clip_export import ClipExportStep

    return ClipExportStep(
        video_synthesis=container.get(Services.VIDEO_SYNTHESIS),
        task_manager=task_manager,
    )


PIPELINE_STEP_PROVIDERS = (
    PipelineStepProvider("download", _build_download_step),
    PipelineStepProvider("transcribe", _build_transcribe_step),
    PipelineStepProvider("translate", _build_translate_step),
    PipelineStepProvider("synthesize", _build_synthesize_step),
    PipelineStepProvider("clip_export", _build_clip_export_step),
)


def configured_pipeline_step_names() -> set[str]:
    return {provider.name for provider in PIPELINE_STEP_PROVIDERS}


def _create_pipeline_step_registry(container):
    from backend.application.pipeline_steps.registry import StepRegistry

    task_manager = container.get(Services.TASK_MANAGER)
    steps = [provider.build(container, task_manager) for provider in PIPELINE_STEP_PROVIDERS]
    registry = StepRegistry(steps)
    if set(registry.list_steps()) != configured_pipeline_step_names():
        raise RuntimeError("Constructed pipeline steps do not match their providers")
    return registry


def _create_task_orchestrator(container):
    from backend.application.task_orchestrator import TaskOrchestrator

    return TaskOrchestrator(
        task_manager=container.get(Services.TASK_MANAGER),
        settings_manager=container.get(Services.SETTINGS_MANAGER),
        pipeline_request_preparer=container.get(Services.PIPELINE_REQUEST_PREPARER),
        pipeline_runner=container.get(Services.PIPELINE),
        task_request_deduplicator=container.get(Services.TASK_REQUEST_DEDUPLICATOR),
        task_resume_service=container.get(Services.TASK_RESUME_SERVICE),
    )


def _create_task_manager(container):
    from backend.services.task_control_service import TaskControlService
    from backend.services.task_event_publisher import TaskEventPublisher
    from backend.services.task_manager import TaskManager
    from backend.services.task_queue_view import TaskQueueView
    from backend.services.task_repository import TaskRepository
    from backend.services.task_runtime_state import TaskRuntimeState

    return TaskManager(
        repository=TaskRepository(),
        event_publisher=TaskEventPublisher(container.get(Services.WS_NOTIFIER)),
        queue_view=TaskQueueView(),
        control_service=TaskControlService(),
        runtime_state=TaskRuntimeState(),
    )


def _create_ws_notifier(_container):
    from backend.core.ws_notifier import WebSocketNotifier

    return WebSocketNotifier()


def _create_asr_service(_container):
    from backend.services.asr import ASRService

    return ASRService()


def _create_platform_factory(container):
    from backend.services.platforms.factory import create_default_platform_factory

    return create_default_platform_factory(
        container.get(Services.BROWSER),
        container.get(Services.SNIFFER),
    )


def _create_downloader_service(container):
    from backend.services.downloader.service import DownloaderService

    return DownloaderService(
        platform_factory=container.get(Services.PLATFORM_FACTORY),
        cookie_manager=container.get(Services.COOKIE_MANAGER),
    )


def _create_video_synthesis(container):
    from backend.services.video.encoder_config import EncoderConfigResolver
    from backend.services.video.ffmpeg_runner import FfmpegRunner
    from backend.services.video.filter_graph_builder import FilterGraphBuilder
    from backend.services.video.synthesis import SynthesisOrchestrator

    return SynthesisOrchestrator(
        filter_graph_builder=FilterGraphBuilder(),
        encoder_config_resolver=EncoderConfigResolver(),
        ffmpeg_runner=FfmpegRunner(),
    )


def _create_browser_service(_container):
    from backend.services.browser_service import BrowserService

    return BrowserService()


def _create_network_sniffer(container):
    from backend.services.sniffer import NetworkSniffer

    return NetworkSniffer(container.get(Services.BROWSER))


def _create_analyzer_service(container):
    from backend.services.analyzer import AnalyzerService

    return AnalyzerService(
        platform_factory=container.get(Services.PLATFORM_FACTORY),
        cookie_manager=container.get(Services.COOKIE_MANAGER),
    )


def _create_cookie_manager(_container):
    from backend.services.cookie_manager import CookieManager

    return CookieManager()


def _create_llm_translator(container):
    from backend.services.translator.llm_translator import LLMTranslator

    return LLMTranslator(
        settings_manager=container.get(Services.SETTINGS_MANAGER),
        glossary_service=container.get(Services.GLOSSARY),
    )


def _create_glossary_service(_container):
    from backend.services.translator.glossary_service import GlossaryService

    return GlossaryService()


def _create_settings_manager(_container):
    from backend.services.settings_manager import SettingsManager

    return SettingsManager()


def _create_pipeline_request_preparer(_container):
    from backend.application.pipeline_request_preparer import PipelineRequestPreparer

    return PipelineRequestPreparer()


def _create_task_request_deduplicator(_container):
    from backend.application.task_request_deduplicator import TaskRequestDeduplicator

    return TaskRequestDeduplicator()


def _create_task_resume_service(_container):
    from backend.application.task_resume_service import TaskResumeService

    return TaskResumeService()


def build_service_assembly() -> ServiceAssembly:
    return ServiceAssembly(
        [
            ServiceProvider(Services.WS_NOTIFIER, _create_ws_notifier),
            ServiceProvider(Services.TASK_MANAGER, _create_task_manager),
            ServiceProvider(Services.PIPELINE_STEPS, _create_pipeline_step_registry),
            ServiceProvider(Services.PIPELINE, _create_pipeline_runner),
            ServiceProvider(Services.ASR, _create_asr_service),
            ServiceProvider(Services.DOWNLOADER, _create_downloader_service),
            ServiceProvider(Services.VIDEO_SYNTHESIS, _create_video_synthesis),
            ServiceProvider(Services.BROWSER, _create_browser_service),
            ServiceProvider(Services.SNIFFER, _create_network_sniffer),
            ServiceProvider(Services.COOKIE_MANAGER, _create_cookie_manager),
            ServiceProvider(Services.PLATFORM_FACTORY, _create_platform_factory),
            ServiceProvider(Services.ANALYZER, _create_analyzer_service),
            ServiceProvider(Services.GLOSSARY, _create_glossary_service),
            ServiceProvider(Services.SETTINGS_MANAGER, _create_settings_manager),
            ServiceProvider(Services.LLM_TRANSLATOR, _create_llm_translator),
            ServiceProvider(Services.PIPELINE_REQUEST_PREPARER, _create_pipeline_request_preparer),
            ServiceProvider(Services.TASK_REQUEST_DEDUPLICATOR, _create_task_request_deduplicator),
            ServiceProvider(Services.TASK_RESUME_SERVICE, _create_task_resume_service),
            ServiceProvider(Services.TASK_ORCHESTRATOR, _create_task_orchestrator),
        ]
    )


def register_all_services(container):
    return build_service_assembly().register_into(container)

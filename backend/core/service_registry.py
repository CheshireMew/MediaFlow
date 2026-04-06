"""
Declarative service assembly for runtime wiring.
"""

from backend.config import settings
from backend.core.container import Services
from backend.core.service_assembly import ServiceAssembly, ServiceProvider


def _create_pipeline_runner(container):
    from backend.core.pipeline import PipelineRunner

    return PipelineRunner(task_manager=container.get(Services.TASK_MANAGER))


def _create_task_orchestrator(container):
    from backend.application.task_orchestrator import TaskOrchestrator
    from backend.application.pipeline_submission_service import PipelineSubmissionService

    return TaskOrchestrator(
        task_manager=container.get(Services.TASK_MANAGER),
        pipeline_runner=container.get(Services.PIPELINE),
        settings_manager=container.get(Services.SETTINGS_MANAGER),
        download_workflow_service=container.get(Services.DOWNLOAD_WORKFLOW),
        transcriber_workflow_service=container.get(Services.TRANSCRIBER_WORKFLOW),
        task_request_deduplicator=container.get(Services.TASK_REQUEST_DEDUPLICATOR),
        task_resume_service=container.get(Services.TASK_RESUME_SERVICE),
        pipeline_submission_service=PipelineSubmissionService(),
    )


def _create_task_manager(container):
    from backend.services.task_event_publisher import TaskEventPublisher
    from backend.services.task_queue_view import TaskQueueView
    from backend.services.task_control_service import TaskControlService
    from backend.services.task_repository import TaskRepository
    from backend.services.task_runtime_state import TaskRuntimeState
    from backend.services.task_manager import TaskManager

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


def _create_video_synthesizer(container):
    from backend.services.video_synthesizer import VideoSynthesizer

    enhancer_service = (
        container.get(Services.ENHANCER)
        if container.has(Services.ENHANCER)
        else None
    )
    return VideoSynthesizer(enhancer_service=enhancer_service)


def _create_enhancer_service(_container):
    from backend.services.enhancer import EnhancerService

    return EnhancerService()


def _create_cleaner_service(_container):
    from backend.services.cleaner import CleanerService

    return CleanerService()


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


def _create_download_workflow_service(_container):
    from backend.application.download_workflow_service import DownloadWorkflowService

    return DownloadWorkflowService()


def _create_transcriber_workflow_service(_container):
    from backend.application.transcriber_workflow_service import (
        TranscriberWorkflowService,
    )

    return TranscriberWorkflowService()


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
            ServiceProvider(Services.PIPELINE, _create_pipeline_runner),
            ServiceProvider(Services.ASR, _create_asr_service),
            ServiceProvider(Services.DOWNLOADER, _create_downloader_service),
            ServiceProvider(Services.VIDEO_SYNTHESIZER, _create_video_synthesizer),
            ServiceProvider(
                Services.ENHANCER,
                _create_enhancer_service,
                enabled=lambda: settings.ENABLE_EXPERIMENTAL_PREPROCESSING,
            ),
            ServiceProvider(
                Services.CLEANER,
                _create_cleaner_service,
                enabled=lambda: settings.ENABLE_EXPERIMENTAL_PREPROCESSING,
            ),
            ServiceProvider(Services.BROWSER, _create_browser_service),
            ServiceProvider(Services.SNIFFER, _create_network_sniffer),
            ServiceProvider(Services.COOKIE_MANAGER, _create_cookie_manager),
            ServiceProvider(Services.PLATFORM_FACTORY, _create_platform_factory),
            ServiceProvider(Services.ANALYZER, _create_analyzer_service),
            ServiceProvider(Services.GLOSSARY, _create_glossary_service),
            ServiceProvider(Services.SETTINGS_MANAGER, _create_settings_manager),
            ServiceProvider(Services.LLM_TRANSLATOR, _create_llm_translator),
            ServiceProvider(Services.DOWNLOAD_WORKFLOW, _create_download_workflow_service),
            ServiceProvider(Services.TRANSCRIBER_WORKFLOW, _create_transcriber_workflow_service),
            ServiceProvider(Services.TASK_REQUEST_DEDUPLICATOR, _create_task_request_deduplicator),
            ServiceProvider(Services.TASK_RESUME_SERVICE, _create_task_resume_service),
            ServiceProvider(Services.TASK_ORCHESTRATOR, _create_task_orchestrator),
        ]
    )


def register_all_services(container):
    return build_service_assembly().register_into(container)


def build_desktop_worker_service_assembly() -> ServiceAssembly:
    return ServiceAssembly(
        [
            ServiceProvider(Services.ASR, _create_asr_service),
            ServiceProvider(Services.DOWNLOADER, _create_downloader_service),
            ServiceProvider(Services.VIDEO_SYNTHESIZER, _create_video_synthesizer),
            ServiceProvider(
                Services.ENHANCER,
                _create_enhancer_service,
                enabled=lambda: settings.ENABLE_EXPERIMENTAL_PREPROCESSING,
            ),
            ServiceProvider(
                Services.CLEANER,
                _create_cleaner_service,
                enabled=lambda: settings.ENABLE_EXPERIMENTAL_PREPROCESSING,
            ),
            ServiceProvider(Services.BROWSER, _create_browser_service),
            ServiceProvider(Services.SNIFFER, _create_network_sniffer),
            ServiceProvider(Services.COOKIE_MANAGER, _create_cookie_manager),
            ServiceProvider(Services.PLATFORM_FACTORY, _create_platform_factory),
            ServiceProvider(Services.ANALYZER, _create_analyzer_service),
            ServiceProvider(Services.GLOSSARY, _create_glossary_service),
            ServiceProvider(Services.SETTINGS_MANAGER, _create_settings_manager),
            ServiceProvider(Services.LLM_TRANSLATOR, _create_llm_translator),
        ]
    )


def register_desktop_worker_services(container):
    return build_desktop_worker_service_assembly().register_into(container)

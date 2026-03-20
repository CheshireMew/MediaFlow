"""
Service Registration — single place to import and register all services.

Extracted from main.py lifespan() (Issue #13) so that:
  1. main.py stays focused on app lifecycle (startup/shutdown).
  2. Service list is easy to scan and modify.
  3. Late imports that were scattered in main.py now live here.
"""

from backend.config import settings
from backend.core.container import container, Services


def _create_pipeline_runner():
    from backend.core.pipeline import PipelineRunner

    return PipelineRunner(container.get(Services.TASK_MANAGER))


def _create_task_orchestrator():
    from backend.application.task_orchestrator import TaskOrchestrator

    return TaskOrchestrator(
        task_manager=container.get(Services.TASK_MANAGER),
        pipeline_runner=container.get(Services.PIPELINE),
        settings_manager=container.get(Services.SETTINGS_MANAGER),
        download_workflow_service=container.get(Services.DOWNLOAD_WORKFLOW),
        transcriber_workflow_service=container.get(Services.TRANSCRIBER_WORKFLOW),
        task_request_deduplicator=container.get(Services.TASK_REQUEST_DEDUPLICATOR),
        task_resume_service=container.get(Services.TASK_RESUME_SERVICE),
    )


def _create_task_manager():
    from backend.services.task_manager import TaskManager

    return TaskManager()


def _create_ws_notifier():
    from backend.core.ws_notifier import WebSocketNotifier

    return WebSocketNotifier()


def _create_asr_service():
    from backend.services.asr import ASRService

    return ASRService()


def _create_downloader_service():
    from backend.services.downloader.service import DownloaderService

    return DownloaderService()


def _create_video_synthesizer():
    from backend.services.video_synthesizer import VideoSynthesizer

    return VideoSynthesizer()


def _create_enhancer_service():
    from backend.services.enhancer import EnhancerService

    return EnhancerService()


def _create_cleaner_service():
    from backend.services.cleaner import CleanerService

    return CleanerService()


def _create_browser_service():
    from backend.services.browser_service import BrowserService

    return BrowserService()


def _create_network_sniffer():
    from backend.services.sniffer import NetworkSniffer

    return NetworkSniffer()


def _create_analyzer_service():
    from backend.services.analyzer import AnalyzerService

    return AnalyzerService()


def _create_cookie_manager():
    from backend.services.cookie_manager import CookieManager

    return CookieManager()


def _create_llm_translator():
    from backend.services.translator.llm_translator import LLMTranslator

    return LLMTranslator()


def _create_glossary_service():
    from backend.services.translator.glossary_service import GlossaryService

    return GlossaryService()


def _create_settings_manager():
    from backend.services.settings_manager import SettingsManager

    return SettingsManager()


def _create_download_workflow_service():
    from backend.application.download_workflow_service import DownloadWorkflowService

    return DownloadWorkflowService()


def _create_transcriber_workflow_service():
    from backend.application.transcriber_workflow_service import (
        TranscriberWorkflowService,
    )

    return TranscriberWorkflowService()


def _create_task_request_deduplicator():
    from backend.application.task_request_deduplicator import TaskRequestDeduplicator

    return TaskRequestDeduplicator()


def _create_task_resume_service():
    from backend.application.task_resume_service import TaskResumeService

    return TaskResumeService()


def _register_if_missing(name, factory) -> bool:
    """Register a service only when it is not already present."""
    if container.has(name):
        return False
    container.register(name, factory)
    return True


def register_all_services():
    """Import and register every service in the DI container."""
    registered_count = 0

    # ── Core ─────────────────────────────────────────────────
    registered_count += _register_if_missing(Services.TASK_MANAGER, _create_task_manager)
    registered_count += _register_if_missing(Services.WS_NOTIFIER, _create_ws_notifier)
    registered_count += _register_if_missing(Services.PIPELINE, _create_pipeline_runner)

    # ── Media ────────────────────────────────────────────────
    registered_count += _register_if_missing(Services.ASR, _create_asr_service)
    registered_count += _register_if_missing(Services.DOWNLOADER, _create_downloader_service)
    registered_count += _register_if_missing(Services.VIDEO_SYNTHESIZER, _create_video_synthesizer)

    if settings.ENABLE_EXPERIMENTAL_PREPROCESSING:
        registered_count += _register_if_missing(Services.ENHANCER, _create_enhancer_service)
        registered_count += _register_if_missing(Services.CLEANER, _create_cleaner_service)

    # ── External / Browser ───────────────────────────────────
    registered_count += _register_if_missing(Services.BROWSER, _create_browser_service)
    registered_count += _register_if_missing(Services.SNIFFER, _create_network_sniffer)
    registered_count += _register_if_missing(Services.ANALYZER, _create_analyzer_service)
    registered_count += _register_if_missing(Services.COOKIE_MANAGER, _create_cookie_manager)

    # ── AI / Translation ─────────────────────────────────────
    registered_count += _register_if_missing(Services.LLM_TRANSLATOR, _create_llm_translator)
    registered_count += _register_if_missing(Services.GLOSSARY, _create_glossary_service)
    registered_count += _register_if_missing(Services.SETTINGS_MANAGER, _create_settings_manager)
    registered_count += _register_if_missing(Services.DOWNLOAD_WORKFLOW, _create_download_workflow_service)
    registered_count += _register_if_missing(Services.TRANSCRIBER_WORKFLOW, _create_transcriber_workflow_service)
    registered_count += _register_if_missing(Services.TASK_REQUEST_DEDUPLICATOR, _create_task_request_deduplicator)
    registered_count += _register_if_missing(Services.TASK_RESUME_SERVICE, _create_task_resume_service)
    registered_count += _register_if_missing(Services.TASK_ORCHESTRATOR, _create_task_orchestrator)

    return registered_count

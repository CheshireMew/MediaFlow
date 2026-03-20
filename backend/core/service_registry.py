"""
Service Registration — single place to import and register all services.

Extracted from main.py lifespan() (Issue #13) so that:
  1. main.py stays focused on app lifecycle (startup/shutdown).
  2. Service list is easy to scan and modify.
  3. Late imports that were scattered in main.py now live here.
"""

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
    from backend.services.task_manager import TaskManager
    from backend.core.ws_notifier import WebSocketNotifier

    registered_count += _register_if_missing(Services.TASK_MANAGER, TaskManager)
    registered_count += _register_if_missing(Services.WS_NOTIFIER, WebSocketNotifier)
    registered_count += _register_if_missing(Services.PIPELINE, _create_pipeline_runner)

    # ── Media ────────────────────────────────────────────────
    from backend.services.asr import ASRService
    from backend.services.downloader.service import DownloaderService
    from backend.services.video_synthesizer import VideoSynthesizer

    registered_count += _register_if_missing(Services.ASR, ASRService)
    registered_count += _register_if_missing(Services.DOWNLOADER, DownloaderService)
    registered_count += _register_if_missing(Services.VIDEO_SYNTHESIZER, VideoSynthesizer)

    from backend.services.enhancer import EnhancerService
    registered_count += _register_if_missing(Services.ENHANCER, EnhancerService)

    from backend.services.cleaner import CleanerService
    registered_count += _register_if_missing(Services.CLEANER, CleanerService)

    # ── External / Browser ───────────────────────────────────
    from backend.services.browser_service import BrowserService
    from backend.services.sniffer import NetworkSniffer
    from backend.services.analyzer import AnalyzerService
    from backend.services.cookie_manager import CookieManager

    registered_count += _register_if_missing(Services.BROWSER, BrowserService)
    registered_count += _register_if_missing(Services.SNIFFER, NetworkSniffer)
    registered_count += _register_if_missing(Services.ANALYZER, AnalyzerService)
    registered_count += _register_if_missing(Services.COOKIE_MANAGER, CookieManager)

    # ── AI / Translation ─────────────────────────────────────
    from backend.services.translator.llm_translator import LLMTranslator
    from backend.services.translator.glossary_service import GlossaryService
    from backend.services.settings_manager import SettingsManager
    from backend.application.download_workflow_service import DownloadWorkflowService
    from backend.application.transcriber_workflow_service import (
        TranscriberWorkflowService,
    )
    from backend.application.task_request_deduplicator import TaskRequestDeduplicator
    from backend.application.task_resume_service import TaskResumeService

    registered_count += _register_if_missing(Services.LLM_TRANSLATOR, LLMTranslator)
    registered_count += _register_if_missing(Services.GLOSSARY, GlossaryService)
    registered_count += _register_if_missing(Services.SETTINGS_MANAGER, SettingsManager)
    registered_count += _register_if_missing(Services.DOWNLOAD_WORKFLOW, DownloadWorkflowService)
    registered_count += _register_if_missing(Services.TRANSCRIBER_WORKFLOW, TranscriberWorkflowService)
    registered_count += _register_if_missing(Services.TASK_REQUEST_DEDUPLICATOR, TaskRequestDeduplicator)
    registered_count += _register_if_missing(Services.TASK_RESUME_SERVICE, TaskResumeService)
    registered_count += _register_if_missing(Services.TASK_ORCHESTRATOR, _create_task_orchestrator)

    return registered_count

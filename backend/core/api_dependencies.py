from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.application.download_service import DownloadApplicationService
    from backend.application.glossary_service import GlossaryApplicationService
    from backend.application.highlight_service import HighlightApplicationService
    from backend.application.settings_service import SettingsApplicationService
    from backend.application.task_operations import TaskOperationService
    from backend.application.task_orchestrator import TaskOrchestrator
    from backend.core.ws_notifier import WebSocketNotifier
    from backend.services.asr import ASRService
    from backend.services.task_manager import TaskManager


@dataclass(frozen=True)
class ApiDependencies:
    download: DownloadApplicationService
    task_operations: TaskOperationService
    task_manager: TaskManager
    task_orchestrator: TaskOrchestrator
    websocket_notifier: WebSocketNotifier
    settings: SettingsApplicationService
    glossary: GlossaryApplicationService
    highlight: HighlightApplicationService
    asr_service: ASRService

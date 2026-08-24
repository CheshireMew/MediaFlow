from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.application.audio_service import AudioApplicationService
    from backend.application.download_service import DownloadApplicationService
    from backend.application.editor_service import EditorApplicationService
    from backend.application.glossary_service import GlossaryApplicationService
    from backend.application.settings_service import SettingsApplicationService
    from backend.application.transcription_service import TranscriptionApplicationService
    from backend.application.translation_service import TranslationApplicationService
    from backend.application.task_orchestrator import TaskOrchestrator
    from backend.core.ws_notifier import WebSocketNotifier
    from backend.services.asr import ASRService
    from backend.services.task_manager import TaskManager


@dataclass(frozen=True)
class ApiDependencies:
    audio: AudioApplicationService
    download: DownloadApplicationService
    editor: EditorApplicationService
    transcription: TranscriptionApplicationService
    translation: TranslationApplicationService
    task_manager: TaskManager
    task_orchestrator: TaskOrchestrator
    websocket_notifier: WebSocketNotifier
    settings: SettingsApplicationService
    glossary: GlossaryApplicationService
    asr_service: ASRService

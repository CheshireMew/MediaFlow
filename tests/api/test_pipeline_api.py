from backend.api.v1.pipeline import _prepare_pipeline_request
from backend.core.container import Services, container
from backend.application.download_workflow_service import DownloadWorkflowService
from backend.application.transcriber_workflow_service import (
    TranscriberWorkflowService,
)
from backend.models.schemas import PipelineRequest
from backend.application.task_orchestrator import TaskOrchestrator
from backend.services.settings_manager import UserSettings


class StubSettingsManager:
    def get_settings(self) -> UserSettings:
        return UserSettings(
            default_download_path="E:/Downloads",
            translation_target_language="Japanese",
            transcription_model="large-v3-turbo",
            auto_execute_flow=True,
        )


class StubTaskOrchestrator(TaskOrchestrator):
    def __init__(self):
        super().__init__(
            task_manager=None,
            pipeline_runner=None,
            settings_manager=StubSettingsManager(),
            download_workflow_service=DownloadWorkflowService(),
            transcriber_workflow_service=TranscriberWorkflowService(),
        )


def test_prepare_pipeline_request_applies_downloader_defaults():
    original_settings_manager = container._instances.get(Services.SETTINGS_MANAGER)
    original_task_orchestrator = container._instances.get(Services.TASK_ORCHESTRATOR)
    container.override(Services.SETTINGS_MANAGER, StubSettingsManager())
    container.override(Services.TASK_ORCHESTRATOR, StubTaskOrchestrator())

    try:
        request = PipelineRequest.model_validate(
            {
                "pipeline_id": "downloader_tool",
                "task_name": "demo",
                "steps": [
                    {
                        "step_name": "download",
                        "params": {
                            "url": "https://example.com/video",
                            "download_subs": True,
                            "resolution": "best",
                            "codec": "avc",
                        },
                    },
                ],
            }
        )

        prepared = _prepare_pipeline_request(request)
    finally:
        if original_settings_manager is None:
            container._instances.pop(Services.SETTINGS_MANAGER, None)
        else:
            container.override(Services.SETTINGS_MANAGER, original_settings_manager)
        if original_task_orchestrator is None:
            container._instances.pop(Services.TASK_ORCHESTRATOR, None)
        else:
            container.override(Services.TASK_ORCHESTRATOR, original_task_orchestrator)

    payload = prepared.model_dump(mode="json")
    assert payload["steps"][0]["params"]["output_dir"] == "E:/Downloads"
    assert [step["step_name"] for step in payload["steps"]] == [
        "download",
        "transcribe",
        "translate",
        "synthesize",
    ]
    assert payload["steps"][1]["params"]["model"] == "large-v3-turbo"
    assert payload["steps"][2]["params"]["target_language"] == "Japanese"


def test_prepare_pipeline_request_expands_transcriber_auto_flow():
    original_settings_manager = container._instances.get(Services.SETTINGS_MANAGER)
    original_task_orchestrator = container._instances.get(Services.TASK_ORCHESTRATOR)
    container.override(Services.SETTINGS_MANAGER, StubSettingsManager())
    container.override(Services.TASK_ORCHESTRATOR, StubTaskOrchestrator())

    try:
        request = PipelineRequest.model_validate(
            {
                "pipeline_id": "transcriber_tool",
                "task_name": "demo",
                "steps": [
                    {
                        "step_name": "transcribe",
                        "params": {
                            "audio_path": "E:/demo.mp4",
                            "model": "small",
                            "device": "cpu",
                            "vad_filter": True,
                        },
                    },
                ],
            }
        )

        prepared = _prepare_pipeline_request(request)
    finally:
        if original_settings_manager is None:
            container._instances.pop(Services.SETTINGS_MANAGER, None)
        else:
            container.override(Services.SETTINGS_MANAGER, original_settings_manager)
        if original_task_orchestrator is None:
            container._instances.pop(Services.TASK_ORCHESTRATOR, None)
        else:
            container.override(Services.TASK_ORCHESTRATOR, original_task_orchestrator)

    payload = prepared.model_dump(mode="json")
    assert [step["step_name"] for step in payload["steps"]] == [
        "transcribe",
        "translate",
        "synthesize",
    ]
    assert payload["steps"][0]["params"]["model"] == "small"
    assert payload["steps"][1]["params"]["target_language"] == "Japanese"

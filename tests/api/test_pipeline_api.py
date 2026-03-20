from backend.application.download_workflow_service import DownloadWorkflowService
from backend.application.task_orchestrator import TaskOrchestrator
from backend.application.transcriber_workflow_service import (
    TranscriberWorkflowService,
)
from backend.models.schemas import PipelineRequest
from backend.services.settings_manager import UserSettings


class StubSettingsManager:
    def get_settings(self) -> UserSettings:
        return UserSettings(
            default_download_path="E:/Downloads",
            translation_target_language="Japanese",
            transcription_model="large-v3-turbo",
            auto_execute_flow=True,
        )


def _create_orchestrator() -> TaskOrchestrator:
    return TaskOrchestrator(
        task_manager=None,
        pipeline_runner=None,
        settings_manager=StubSettingsManager(),
        download_workflow_service=DownloadWorkflowService(),
        transcriber_workflow_service=TranscriberWorkflowService(),
    )


def test_prepare_pipeline_request_applies_downloader_defaults():
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

    prepared = _create_orchestrator().prepare_pipeline_request(request)
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

    prepared = _create_orchestrator().prepare_pipeline_request(request)
    payload = prepared.model_dump(mode="json")

    assert [step["step_name"] for step in payload["steps"]] == [
        "transcribe",
        "translate",
        "synthesize",
    ]
    assert payload["steps"][0]["params"]["model"] == "small"
    assert payload["steps"][1]["params"]["target_language"] == "Japanese"

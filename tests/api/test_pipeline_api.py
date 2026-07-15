from backend.application.pipeline_request_preparer import PipelineRequestPreparer
from backend.models.pipeline_contracts import PipelineRequest
from backend.services.settings_manager import UserSettings


def prepare(
    payload: dict,
    *,
    default_download_path: str | None = "E:/Downloads",
) -> dict:
    request = PipelineRequest.model_validate(payload)
    settings = UserSettings(
        default_download_path=default_download_path,
        auto_execute_flow=True,
    )
    return PipelineRequestPreparer().prepare(request, settings).model_dump(mode="json")


def test_prepare_pipeline_request_applies_download_default_to_the_download_step():
    payload = prepare(
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
                }
            ],
        }
    )

    assert payload["steps"][0]["params"]["output_dir"] == "E:/Downloads"
    assert [step["step_name"] for step in payload["steps"]] == ["download"]


def test_prepare_pipeline_request_does_not_change_non_download_steps():
    payload = prepare(
        {
            "pipeline_id": "transcriber_tool",
            "steps": [
                {
                    "step_name": "transcribe",
                    "params": {
                        "audio_ref": {"path": "E:/demo.mp4", "name": "demo.mp4"},
                        "model": "small",
                        "device": "cpu",
                    },
                }
            ],
        }
    )

    assert payload["steps"][0]["step_name"] == "transcribe"
    assert payload["steps"][0]["params"]["model"] == "small"


def test_prepare_pipeline_request_preserves_explicit_download_output_dir():
    payload = prepare(
        {
            "steps": [
                {
                    "step_name": "download",
                    "params": {
                        "url": "https://example.com/video",
                        "output_dir": "D:/Explicit",
                    },
                }
            ]
        }
    )
    assert payload["steps"][0]["params"]["output_dir"] == "D:/Explicit"


def test_prepare_pipeline_request_does_not_inject_ui_export_timeline_settings():
    payload = prepare(
        {
            "steps": [
                {
                    "step_name": "synthesize",
                    "params": {
                        "video_ref": {"path": "E:/demo.mp4", "name": "demo.mp4"},
                        "options": {"skip_subtitles": True},
                    },
                }
            ]
        },
    )

    assert payload["steps"][0]["params"]["options"] == {
        "skip_subtitles": True,
    }

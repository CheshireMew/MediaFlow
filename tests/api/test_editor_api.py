import subprocess

import pytest
from pydantic import ValidationError

from backend.config import settings
from backend.models.pipeline_contracts import PipelineRequest


@pytest.mark.parametrize(
    "retired_path",
    ["/api/v1/editor/synthesize", "/api/v1/editor/clips/export"],
)
def test_retired_editor_task_endpoints_do_not_exist(client, retired_path):
    response = client.post(retired_path, json={})

    assert response.status_code == 404


def test_synthesis_pipeline_rejects_legacy_watermark_path():
    with pytest.raises(ValidationError, match="watermark_path"):
        PipelineRequest.model_validate(
            {
                "steps": [
                    {
                        "step_name": "synthesize",
                        "params": {
                            "video_ref": {"path": "E:/video.mp4", "name": "video.mp4"},
                            "watermark_path": "E:/legacy.png",
                            "options": {"skip_subtitles": True},
                        },
                    }
                ]
            }
        )


def test_clip_export_pipeline_rejects_invalid_segment_range():
    with pytest.raises(ValidationError):
        PipelineRequest.model_validate(
            {
                "steps": [
                    {
                        "step_name": "clip_export",
                        "params": {
                            "video_ref": {"path": "E:/video.mp4", "name": "video.mp4"},
                            "render_mode": "source",
                            "segments": [{"id": "clip-1", "start": -1, "end": 1}],
                        },
                    }
                ]
            }
        )


def test_media_export_timeline_uses_existing_whisper_segments(isolated_api_client, tmp_path):
    video_path = tmp_path / "speech_timeline_preview.mp4"
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:r=10:d=4",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )
    settings_response = isolated_api_client.patch(
        "/api/v1/settings/preferences",
        json={"auto_trim_silence": True},
    )
    assert settings_response.status_code == 200

    response = isolated_api_client.post(
        "/api/v1/editor/preview/media/export-timeline",
        json={
            "video_ref": {
                "path": str(video_path),
                "name": video_path.name,
            },
            "speech_segments": [
                {"id": "late", "start": 2.75, "end": 3.2, "text": "Later"},
                {"id": "early", "start": 0.8, "end": 1.5, "text": "Earlier"},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["no_speech_trim_enabled"] is True
    assert payload["has_speech_timeline"] is True
    assert payload["has_leading_no_speech"] is True
    assert payload["has_trailing_no_speech"] is True
    assert payload["trim_start"] == 0.8
    assert payload["trim_end"] == 3.2

    no_speech_response = isolated_api_client.post(
        "/api/v1/editor/preview/media/export-timeline",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "speech_segments": [],
        },
    )
    assert no_speech_response.status_code == 200
    no_speech_payload = no_speech_response.json()
    assert no_speech_payload["no_speech_trim_enabled"] is False
    assert no_speech_payload["has_speech_timeline"] is False
    assert no_speech_payload["trim_start"] == 0
    assert no_speech_payload["trim_end"] == pytest.approx(4.0, abs=0.15)

    retired_response = isolated_api_client.post(
        "/api/v1/editor/preview/media/auto-trim",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "speech_segments": [],
        },
    )
    assert retired_response.status_code == 404

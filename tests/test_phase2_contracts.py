import pytest
from unittest.mock import MagicMock, AsyncMock

from backend.models.media_contracts import MediaReference
from backend.models.task_result_contracts import DownloadOutput
from backend.models.pipeline_contracts import PipelineStepRequest
from backend.core.pipeline import PipelineRunner
from backend.application.pipeline_steps.registry import StepRegistry

@pytest.mark.asyncio
async def test_pipeline_runner_result_structure():
    mock_tm = AsyncMock()
    mock_tm.update_task.return_value = None
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)

    # Mock a step that adds data to context
    class MockStep:
        name = "download"
        resume_policy = "idempotent"

        async def execute(self, ctx, params, task_id):
            ctx.set_media(
                "video_ref",
                MediaReference(
                    path="/tmp/video.mp4",
                    name="video.mp4",
                    media_kind="video",
                    role="output",
                ),
                kind="video",
            )
            ctx.publish_download(
                DownloadOutput(
                    id="download-1",
                    title="Video",
                    duration=1,
                    filename="video.mp4",
                    source_url="https://example.com/video",
                )
            )

    runner = PipelineRunner(
        task_manager=mock_tm,
        step_registry=StepRegistry([MockStep()]),
    )
    steps = [PipelineStepRequest(step_name="download", params={"url": "https://example.com/video"})]
    await runner.run(steps, task_id="test_task")

    assert mock_tm.update_task.called
    completed_call = None
    for call in mock_tm.update_task.call_args_list:
        _, kwargs = call
        if kwargs.get("status") == "completed":
            completed_call = kwargs
            break

    assert completed_call is not None
    result = completed_call["result"]
    assert result["success"] is True
    assert "artifacts" in result
    assert "files" not in result
    assert "outputs" in result

    artifacts = result["artifacts"]
    assert len(artifacts) == 1
    assert artifacts[0]["ref"]["path"] == "/tmp/video.mp4"
    assert artifacts[0]["kind"] == "video"

    outputs = result["outputs"]
    assert outputs["download"]["filename"] == "video.mp4"
    assert "execution_trace" in result

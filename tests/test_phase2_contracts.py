import pytest
from unittest.mock import MagicMock, AsyncMock

from backend.models.schemas import MediaReference, PipelineStepRequest
from backend.core.pipeline import PipelineRunner
from backend.core.steps.registry import StepRegistry

@pytest.mark.asyncio
async def test_pipeline_runner_result_structure():
    mock_tm = AsyncMock()
    mock_tm.update_task.return_value = None
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)

    # Mock a step that adds data to context
    class MockStep:
        name = "download"

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
            ctx.set("some_meta", "value")

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
    assert "meta" in result

    artifacts = result["artifacts"]
    assert len(artifacts) == 1
    assert artifacts[0]["ref"]["path"] == "/tmp/video.mp4"
    assert artifacts[0]["kind"] == "video"

    meta = result["meta"]
    assert "video_ref" not in meta
    assert "video_path" not in meta
    assert meta["some_meta"] == "value"
    assert "execution_trace" in meta

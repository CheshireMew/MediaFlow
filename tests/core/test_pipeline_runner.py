import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.core.pipeline import PipelineRunner
from backend.core.context import PipelineContext
from backend.core.task_control import TaskCancelRequested
from backend.models.media_contracts import MediaReference
from backend.models.pipeline_contracts import DownloadParams, PipelineStepRequest, TranslateParams
from backend.models.task_result_contracts import DownloadOutput


def test_pipeline_step_request_resolves_params_from_the_step_catalog():
    request = PipelineStepRequest(
        step_name="translate",
        params={
            "target_language": "Japanese",
            "mode": "proofread",
        },
    )

    assert isinstance(request.params, TranslateParams)
    assert request.params.target_language.value == "Japanese"
    assert request.params.mode == "proofread"

@pytest.mark.asyncio
async def test_pipeline_runner_success():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    mock_step = AsyncMock()
    async def execute(ctx, _params, _task_id):
        ctx.publish_download(
            DownloadOutput(
                id="download-1",
                title="Video",
                duration=1,
                filename="video.mp4",
                source_url="https://example.com/video",
            )
        )
        ctx.set_media(
            "video_ref",
            MediaReference(path="/tmp/video.mp4", name="video.mp4"),
            kind="video",
        )

    mock_step.execute = AsyncMock(side_effect=execute)
    mock_step.name = "download"
    registry = MagicMock()
    registry.get_step.return_value = mock_step
    runner = PipelineRunner(task_manager=mock_tm, step_registry=registry)
    params = DownloadParams(url="https://example.com/video")
    step_req = PipelineStepRequest(step_name="download", params=params)

    result = await runner.run([step_req], task_id="task-123")

    assert result["status"] == "completed"
    assert "download" in result["history"]
    registry.get_step.assert_called_with("download")
    mock_step.execute.assert_called_once()
    call_args = mock_step.execute.call_args
    assert isinstance(call_args[0][0], PipelineContext)
    assert call_args[0][1] == params.model_dump(mode="json")
    assert call_args[0][2] == "task-123"

@pytest.mark.asyncio
async def test_pipeline_runner_cancellation():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(
        side_effect=TaskCancelRequested("Task cancelled by user")
    )
    runner = PipelineRunner(task_manager=mock_tm, step_registry=MagicMock())

    params = DownloadParams(url="https://example.com/video")
    step_req = PipelineStepRequest(step_name="download", params=params)
    steps = [step_req]

    result = await runner.run(steps, task_id="task-123")

    assert result["status"] == "cancelled"
    mock_tm.mark_controlled_stop.assert_any_call(
        "task-123",
        "cancel",
        "cancelled",
        {},
    )

@pytest.mark.asyncio
async def test_pipeline_runner_step_failure():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.raise_if_control_requested = MagicMock(return_value=None)
    mock_step = AsyncMock()
    mock_step.execute.side_effect = Exception("Step Failed!")
    registry = MagicMock()
    registry.get_step.return_value = mock_step
    runner = PipelineRunner(task_manager=mock_tm, step_registry=registry)
    params = DownloadParams(url="https://example.com/video")
    step_req = PipelineStepRequest(step_name="download", params=params)

    with pytest.raises(Exception, match="Step Failed!"):
        await runner.run([step_req], task_id="task-123")

    failure_call = mock_tm.update_task.call_args_list[-1]
    assert failure_call.kwargs["status"] == "failed"
    assert "Step Failed" in failure_call.kwargs["error"]

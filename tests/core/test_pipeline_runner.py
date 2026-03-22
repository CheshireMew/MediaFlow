import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.core.pipeline import PipelineRunner
from backend.core.context import PipelineContext
from backend.models.schemas import DownloadStepRequest, DownloadParams
from backend.core.steps.registry import StepRegistry

@pytest.mark.asyncio
async def test_pipeline_runner_success():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.is_cancelled = MagicMock(return_value=False)
    runner = PipelineRunner(task_manager=mock_tm)
    mock_step = AsyncMock()
    mock_step.execute = AsyncMock()
    mock_step.name = "download"
    
    # Mock Registry
    with patch.object(StepRegistry, 'get_step', return_value=mock_step) as mock_get_step:
        # Use valid Pydantic model
        params = DownloadParams(url="https://example.com/video")
        step_req = DownloadStepRequest(step_name="download", params=params)
        steps = [step_req]
        
        # Execute
        result = await runner.run(steps, task_id="task-123")

        # Verify
        assert result["status"] == "completed"
        assert "download" in result["history"]
        mock_get_step.assert_called_with("download")
        mock_step.execute.assert_called_once()
        call_args = mock_step.execute.call_args
        assert isinstance(call_args[0][0], PipelineContext)
        assert call_args[0][1] == params.model_dump()
        assert call_args[0][2] == "task-123"

@pytest.mark.asyncio
async def test_pipeline_runner_cancellation():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.is_cancelled = MagicMock(return_value=True)
    runner = PipelineRunner(task_manager=mock_tm)

    params = DownloadParams(url="https://example.com/video")
    step_req = DownloadStepRequest(step_name="download", params=params)
    steps = [step_req]

    result = await runner.run(steps, task_id="task-123")

    assert result["status"] == "cancelled"
    mock_tm.mark_controlled_stop.assert_any_call("task-123", "cancel", "Pipeline cancelled")

@pytest.mark.asyncio
async def test_pipeline_runner_step_failure():
    # Setup
    mock_tm = AsyncMock()
    mock_tm.is_cancelled = MagicMock(return_value=False)
    runner = PipelineRunner(task_manager=mock_tm)
    mock_step = AsyncMock()
    mock_step.execute.side_effect = Exception("Step Failed!")
    
    with patch.object(StepRegistry, 'get_step', return_value=mock_step):
        params = DownloadParams(url="https://example.com/video")
        step_req = DownloadStepRequest(step_name="download", params=params)
        steps = [step_req]
        
        with pytest.raises(Exception, match="Step Failed!"):
            await runner.run(steps, task_id="task-123")
        
        failure_call = mock_tm.update_task.call_args_list[-1]
        assert failure_call.kwargs["status"] == "failed"
        assert "Step Failed" in failure_call.kwargs["error"]

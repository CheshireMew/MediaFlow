import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch

from backend.models.schemas import TaskResult, FileRef, PipelineStepRequest
from backend.core.pipeline import PipelineRunner
from backend.core.context import PipelineContext
from backend.core.steps import StepRegistry
from backend.core.container import container, Services

@pytest.mark.asyncio
async def test_pipeline_runner_result_structure():
    mock_tm = AsyncMock()
    mock_tm.update_task.return_value = None
    # is_cancelled is synchronous in real implementation
    mock_tm.is_cancelled = MagicMock(return_value=False)

    runner = PipelineRunner(task_manager=mock_tm)
    
    # Mock a step that adds data to context
    class MockStep:
        async def execute(self, ctx, params, task_id):
            ctx.set("video_path", "/tmp/video.mp4")
            ctx.set("some_meta", "value")

    # Patch StepRegistry.get_step (correct module path: backend.core.steps)
    with patch('backend.core.steps.StepRegistry.get_step', return_value=MockStep()):
        steps = [PipelineStepRequest(step_name="download", params={"url": "https://example.com/video"})]
        
        await runner.run(steps, task_id="test_task")
        
        # Check what was passed to update_task
        # The last call to update_task should be status="completed"
        assert mock_tm.update_task.called
        
        # Find the call with status="completed"
        completed_call = None
        for call in mock_tm.update_task.call_args_list:
            _, kwargs = call
            if kwargs.get("status") == "completed":
                completed_call = kwargs
                break
        
        assert completed_call is not None
        result = completed_call["result"]
        
        # Verification: Result should be a Dict representing TaskResult
        print(f"Result: {result}")
        assert result["success"] is True
        assert "files" in result
        assert "meta" in result
        
        # Check file extraction logic
        files = result["files"]
        assert len(files) == 1
        f0 = files[0]
        assert f0["path"] == "/tmp/video.mp4" 
        assert f0["type"] == "video"
        
        # Check meta
        meta = result["meta"]
        assert meta["video_path"] == "/tmp/video.mp4"
        assert meta["some_meta"] == "value"
        assert "execution_trace" in meta

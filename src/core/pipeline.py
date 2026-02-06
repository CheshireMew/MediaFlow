import asyncio
import time
from typing import Any, Dict, List
from loguru import logger

from src.models.schemas import PipelineStepRequest
from src.core.context import PipelineContext
from src.core.steps import StepRegistry
from src.core.container import container, Services


def _get_task_manager():
    return container.get(Services.TASK_MANAGER)


class PipelineRunner:
    async def run(self, steps: List[PipelineStepRequest], task_id: str = None) -> Dict[str, Any]:
        ctx = PipelineContext()
        tm = _get_task_manager()
        logger.info(f"Starting pipeline with {len(steps)} steps. TaskID: {task_id}")

        if task_id:
            await tm.update_task(task_id, status="running", message="Starting pipeline...")

        for i, step_req in enumerate(steps):
            logger.info(f"Executing step {i+1}: {step_req.step_name}")
            
            # Check for cancellation before step
            if task_id and tm.is_cancelled(task_id):
                await tm.update_task(task_id, status="cancelled", message="Pipeline cancelled by user")
                raise Exception("Pipeline cancelled")

            try:
                if task_id:
                    await tm.update_task(task_id, message=f"Executing step: {step_req.step_name}")

                # OCP: Dispatch via Registry
                start_time = time.time()
                status = "success"
                error_msg = None
                
                try:
                    step_instance = StepRegistry.get_step(step_req.step_name)
                    # Convert Pydantic model to dict for step execution
                    params_dict = step_req.params.model_dump()
                    await step_instance.execute(ctx, params_dict, task_id)
                    ctx.history.append(step_req.step_name)
                except Exception as step_err:
                    status = "failed"
                    error_msg = str(step_err)
                    raise step_err
                finally:
                    duration = time.time() - start_time
                    ctx.add_trace(step_req.step_name, duration, status, error_msg)

            except Exception as e:
                logger.error(f"Pipeline failed at step {step_req.step_name}: {e}")
                if task_id:
                    if "cancelled" in str(e):
                        await tm.update_task(task_id, status="cancelled", message="Cancelled")
                    else:
                        await tm.update_task(task_id, status="failed", error=str(e), message=f"Failed at {step_req.step_name}")
                raise e
        
        # Determine final status
        if task_id:
            # Ensure data is serializable
            safe_data = {}
            for k, v in ctx.data.items():
                if hasattr(v, 'as_posix'):  # Path objects
                    safe_data[k] = str(v)
                else:
                    safe_data[k] = v
            
            # Add trace to result
            safe_data["execution_trace"] = ctx.trace

            await tm.update_task(
                task_id, 
                status="completed", 
                progress=100.0, 
                message="Pipeline completed",
                result=safe_data 
            )

        return {
            "status": "completed", 
            "history": ctx.history,
            "final_data": ctx.data
        }


# Note: PipelineRunner is registered via container in main.py
# The global instance is kept for backward compatibility but will be deprecated


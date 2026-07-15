import time
from typing import Any, Dict, List, TYPE_CHECKING
from loguru import logger

from backend.core.task_control import TaskCancelRequested, TaskPauseRequested
from backend.models.media_contracts import TaskResult
from backend.models.pipeline_contracts import PipelineStepRequest
from backend.core.context import PipelineContext
from backend.core.task_runtime import TaskRuntimeContext

if TYPE_CHECKING:
    from backend.services.task_manager import TaskManager


class PipelineRunner:
    def __init__(self, *, task_manager: "TaskManager", step_registry):
        self.task_manager = task_manager
        self._step_registry = step_registry

    async def run(self, steps: List[PipelineStepRequest], task_id: str = None) -> Dict[str, Any]:
        ctx = PipelineContext()
        runtime = TaskRuntimeContext(task_id, task_manager=self.task_manager)
        logger.info(f"Starting pipeline with {len(steps)} steps. TaskID: {task_id}")

        try:
            if task_id:
                await runtime.update(
                    status="running",
                    cancelled=False,
                    message_code="pipeline_starting",
                    message_params={},
                )

            for i, step_req in enumerate(steps):
                logger.info(f"Executing step {i+1}: {step_req.step_name}")

                if task_id:
                    runtime.checkpoint()

                try:
                    if task_id:
                        await runtime.update(
                            message_code="pipeline_step_running",
                            message_params={"step": step_req.step_name},
                        )

                    start_time = time.time()
                    status = "success"
                    error_msg = None

                    try:
                        step_instance = self._step_registry.get_step(step_req.step_name)
                        params_dict = step_req.params.model_dump(mode="json")
                        await step_instance.execute(ctx, params_dict, task_id)
                        ctx.history.append(step_req.step_name)
                    except Exception as step_err:
                        status = "failed"
                        error_msg = str(step_err)
                        raise step_err
                    finally:
                        duration = time.time() - start_time
                        ctx.add_trace(step_req.step_name, duration, status, error_msg)

                except (TaskPauseRequested, TaskCancelRequested):
                    raise
                except Exception as e:
                    logger.error(f"Pipeline failed at step {step_req.step_name}: {e}")
                    if task_id:
                        await runtime.update(
                            status="failed",
                            error=str(e),
                            message_code="pipeline_step_failed",
                            message_params={"step": step_req.step_name},
                        )
                    raise e

            if task_id:
                runtime.checkpoint()

            try:
                ctx.require_step_outputs([step.step_name for step in steps])
                task_result = TaskResult(
                    success=True,
                    artifacts=[
                        artifact
                        for artifact in ctx.artifacts
                        if artifact.role == "output"
                    ],
                    outputs=ctx.outputs,
                    execution_trace=ctx.trace,
                )
            except Exception as result_error:
                if task_id:
                    await runtime.update(
                        status="failed",
                        error=str(result_error),
                        message_code="pipeline_step_failed",
                        message_params={"step": "result_contract"},
                    )
                raise

            if task_id:
                await runtime.update(
                    status="completed",
                    cancelled=False,
                    progress=100.0,
                    message_code="pipeline_completed",
                    message_params={},
                    result=task_result.model_dump(mode="json"),
                )

            return {
                "status": "completed",
                "history": ctx.history,
                "result": task_result.model_dump(mode="json"),
            }
        except TaskPauseRequested:
            if task_id:
                await runtime.mark_controlled_stop("pause", "paused", {})
            return {"status": "paused", "history": ctx.history}
        except TaskCancelRequested:
            if task_id:
                await runtime.mark_controlled_stop("cancel", "cancelled", {})
            return {"status": "cancelled", "history": ctx.history}

# Note: PipelineRunner is registered via container in main.py.

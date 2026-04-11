import inspect
import time
from typing import Any, Dict, List
from loguru import logger

from backend.core.task_control import TaskCancelRequested, TaskPauseRequested
from backend.models.schemas import PipelineStepRequest, TaskResult, FileRef
from backend.core.context import PipelineContext
from backend.core.runtime_access import RuntimeServices, TaskRuntimeContext
from backend.core.steps import StepRegistry


class PipelineRunner:
    def __init__(self, *, task_manager):
        self.task_manager = task_manager

    async def _raise_if_control_requested(self, task_id: str | None) -> None:
        if not task_id:
            return

        is_cancelled = getattr(self.task_manager, "is_cancelled", None)
        if callable(is_cancelled) and is_cancelled(task_id):
            raise TaskCancelRequested("Pipeline cancelled")

        checker = getattr(self.task_manager, "raise_if_control_requested", None)
        if callable(checker):
            result = checker(task_id)
            if inspect.isawaitable(result):
                await result
            return

    async def run(self, steps: List[PipelineStepRequest], task_id: str = None) -> Dict[str, Any]:
        ctx = PipelineContext()
        runtime = TaskRuntimeContext.for_task(task_id, task_manager=self.task_manager)
        logger.info(f"Starting pipeline with {len(steps)} steps. TaskID: {task_id}")

        try:
            if task_id:
                await runtime.update(status="running", cancelled=False, message="Starting pipeline...")

            for i, step_req in enumerate(steps):
                logger.info(f"Executing step {i+1}: {step_req.step_name}")

                if task_id:
                    await self._raise_if_control_requested(task_id)

                try:
                    if task_id:
                        await runtime.update(message=f"Executing step: {step_req.step_name}")

                    start_time = time.time()
                    status = "success"
                    error_msg = None

                    try:
                        step_instance = StepRegistry.get_step(step_req.step_name)
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

                except (TaskPauseRequested, TaskCancelRequested):
                    raise
                except Exception as e:
                    logger.error(f"Pipeline failed at step {step_req.step_name}: {e}")
                    if task_id:
                        await runtime.update(
                            status="failed",
                            error=str(e),
                            message=f"Failed at {step_req.step_name}",
                        )
                    raise e

            if task_id:
                await self._raise_if_control_requested(task_id)
                files = []
                meta = {}

                for k, v in ctx.data.items():
                    val_str = str(v) if hasattr(v, "as_posix") else v
                    if k.endswith("_path") and isinstance(val_str, str):
                        ftype = "file"
                        if "video" in k:
                            ftype = "video"
                        elif "audio" in k:
                            ftype = "audio"
                        elif "subtitle" in k or "srt" in k:
                            ftype = "subtitle"
                        elif "image" in k:
                            ftype = "image"

                        files.append(FileRef(type=ftype, path=val_str, label=k))
                        meta[k] = val_str
                    else:
                        meta[k] = val_str

                meta["execution_trace"] = ctx.trace

                task_result = TaskResult(success=True, files=files, meta=meta)

                await runtime.update(
                    status="completed",
                    cancelled=False,
                    progress=100.0,
                    message="Pipeline completed",
                    result=task_result.model_dump(),
                )

            return {
                "status": "completed",
                "history": ctx.history,
                "final_data": ctx.data,
            }
        except TaskPauseRequested as e:
            if task_id:
                await runtime.mark_controlled_stop("pause", str(e))
            return {"status": "paused", "history": ctx.history, "final_data": ctx.data}
        except TaskCancelRequested as e:
            if task_id:
                await runtime.mark_controlled_stop("cancel", str(e))
            return {"status": "cancelled", "history": ctx.history, "final_data": ctx.data}

# Note: PipelineRunner is registered via container in main.py.

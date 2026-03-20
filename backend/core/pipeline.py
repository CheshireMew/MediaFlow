import asyncio
import time
from typing import Any, Dict, List
from loguru import logger

from backend.core.task_control import TaskCancelRequested, TaskPauseRequested
from backend.models.schemas import PipelineStepRequest, TaskResult, FileRef
from backend.core.context import PipelineContext
from backend.core.steps import StepRegistry
from backend.core.container import container, Services


class PipelineRunner:
    def __init__(self, task_manager=None):
        self.task_manager = task_manager or container.get(Services.TASK_MANAGER)

    async def run(self, steps: List[PipelineStepRequest], task_id: str = None) -> Dict[str, Any]:
        ctx = PipelineContext()
        tm = self.task_manager
        logger.info(f"Starting pipeline with {len(steps)} steps. TaskID: {task_id}")

        try:
            if task_id:
                await tm.update_task(task_id, status="running", cancelled=False, message="Starting pipeline...")

            for i, step_req in enumerate(steps):
                logger.info(f"Executing step {i+1}: {step_req.step_name}")

                if task_id:
                    tm.raise_if_control_requested(task_id)

                try:
                    if task_id:
                        await tm.update_task(task_id, message=f"Executing step: {step_req.step_name}")

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
                        await tm.update_task(task_id, status="failed", error=str(e), message=f"Failed at {step_req.step_name}")
                    raise e

            if task_id:
                tm.raise_if_control_requested(task_id)
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

                await tm.update_task(
                    task_id,
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
                await tm.mark_controlled_stop(task_id, "pause", str(e))
            return {"status": "paused", "history": ctx.history, "final_data": ctx.data}
        except TaskCancelRequested as e:
            if task_id:
                await tm.mark_controlled_stop(task_id, "cancel", str(e))
            return {"status": "cancelled", "history": ctx.history, "final_data": ctx.data}

# Note: PipelineRunner is registered via container in main.py.

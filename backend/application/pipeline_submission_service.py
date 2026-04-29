from loguru import logger


class PipelineSubmissionService:
    async def submit_pipeline(
        self,
        *,
        orchestrator,
        req,
        task_type: str,
    ) -> dict:
        existing_task_id = orchestrator.find_existing_task(
            task_type,
            req.model_dump(mode="json"),
        )
        if existing_task_id:
            task = orchestrator.get_task(existing_task_id)
            if task:
                if task.status in ["running", "pending"]:
                    logger.info(f"Duplicate task request ignored: {existing_task_id}")
                    return {
                        "task_id": existing_task_id,
                        "status": task.status,
                        "message": "Task already active",
                    }

                logger.info(f"Recycling existing task: {existing_task_id}")
                await orchestrator.reset_task_for_reuse(existing_task_id)
                await orchestrator.enqueue_existing_task(existing_task_id, queued_message="Queued")
                return {
                    "task_id": existing_task_id,
                    "status": "pending",
                    "message": "Task restarted (Recycled)",
                }

        params = req.model_dump(mode="json")
        logger.info(
            f"Pipeline Request: task_name={req.task_name}, steps={len(req.steps)}, type={task_type}"
        )
        logger.debug(f"DEBUG PIPELINE PARAMS TYPE: {type(params)}")
        logger.debug(f"DEBUG PIPELINE PARAMS CONTENT: {params}")

        return await orchestrator.submit_task(
            task_type=task_type,
            task_name=req.task_name,
            request_params=req.model_dump(mode="json"),
            initial_message="Queued",
            queued_message="Queued",
        )

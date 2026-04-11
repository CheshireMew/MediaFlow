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
            task = orchestrator._task_manager.get_task(existing_task_id)
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
                await orchestrator._task_manager.enqueue_task(
                    existing_task_id,
                    lambda: orchestrator._pipeline_runner.run(req.steps, existing_task_id),
                    queued_message="Queued",
                )
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

        task_id = await orchestrator._task_manager.create_task(
            task_type,
            "Queued",
            request_params=req.model_dump(mode="json"),
            task_name=req.task_name,
        )

        await orchestrator._task_manager.enqueue_task(
            task_id,
            lambda: orchestrator._pipeline_runner.run(req.steps, task_id),
            queued_message="Queued",
        )

        return {"task_id": task_id, "status": "pending", "message": "Task queued"}

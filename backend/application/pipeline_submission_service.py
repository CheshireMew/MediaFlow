from loguru import logger

from backend.models.schemas import TaskView


def task_submission_response(task: TaskView, message: str | None = None) -> dict:
    return {
        "task_id": task.id,
        "status": task.status,
        "message": message if message is not None else task.message,
        "task_source": task.task_source,
        "task_contract_version": task.task_contract_version,
        "persistence_scope": task.persistence_scope,
        "lifecycle": task.lifecycle,
        "queue_state": task.queue_state,
        "queue_position": task.queue_position,
        "primary_operation": task.primary_operation,
    }


class PipelineSubmissionService:
    async def submit_pipeline(
        self,
        *,
        orchestrator,
        req,
        task_type: str,
    ) -> dict:
        request_params = req.model_dump(mode="json")
        existing_task_id = orchestrator.find_existing_task(
            task_type,
            request_params,
        )
        if existing_task_id:
            task = orchestrator.get_task(existing_task_id)
            if task:
                if task.status in ["running", "pending"]:
                    logger.info(f"Duplicate task request ignored: {existing_task_id}")
                    return task_submission_response(
                        orchestrator.serialize_task(task),
                        "Task already active",
                    )

                logger.info(f"Recycling existing task: {existing_task_id}")
                await orchestrator.reset_task_for_reuse(
                    existing_task_id,
                    request_params=request_params,
                )
                await orchestrator.enqueue_existing_task(existing_task_id, queued_message="Queued")
                restarted = orchestrator.get_task(existing_task_id)
                return task_submission_response(
                    orchestrator.serialize_task(restarted),
                    "Task restarted",
                )

        logger.info(
            f"Pipeline Request: task_name={req.task_name}, steps={len(req.steps)}, type={task_type}"
        )
        logger.debug(f"DEBUG PIPELINE PARAMS TYPE: {type(request_params)}")
        logger.debug(f"DEBUG PIPELINE PARAMS CONTENT: {request_params}")

        return await orchestrator.submit_task(
            task_type=task_type,
            task_name=req.task_name,
            request_params=request_params,
            initial_message="Queued",
            queued_message="Queued",
        )

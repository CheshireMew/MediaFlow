from loguru import logger

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE


def task_submission_response(task_id: str, status: str, message: str) -> dict:
    return {
        "task_id": task_id,
        "status": status,
        "message": message,
        "task_source": "backend",
        "task_contract_version": TASK_CONTRACT_VERSION,
        "persistence_scope": "runtime",
        "lifecycle": TASK_LIFECYCLE["resumable"],
        "queue_state": "queued" if status == "pending" else status,
        "queue_position": None,
    }


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
                    return task_submission_response(
                        existing_task_id,
                        task.status,
                        "Task already active",
                    )

                logger.info(f"Recycling existing task: {existing_task_id}")
                await orchestrator.reset_task_for_reuse(existing_task_id)
                await orchestrator.enqueue_existing_task(existing_task_id, queued_message="Queued")
                return task_submission_response(
                    existing_task_id,
                    "pending",
                    "Task restarted",
                )

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

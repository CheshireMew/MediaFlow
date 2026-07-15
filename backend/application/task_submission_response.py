from backend.models.task_contracts import TaskView


def task_submission_response(
    task: TaskView,
    message_code: str | None = None,
    message_params: dict | None = None,
) -> dict:
    return {
        "task_id": task.id,
        "status": task.status,
        "message_code": message_code if message_code is not None else task.message_code,
        "message_params": message_params if message_params is not None else task.message_params,
        "task_source": task.task_source,
        "task_contract_version": task.task_contract_version,
        "persistence_scope": task.persistence_scope,
        "lifecycle": task.lifecycle,
        "queue_state": task.queue_state,
        "queue_position": task.queue_position,
        "primary_operation": task.primary_operation,
        "revision": task.revision,
    }

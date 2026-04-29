from backend.core.tasks.registry import (
    REQUIRED_TASK_TYPES,
    registered_task_types,
    register_all_task_runners,
    validate_required_task_runners,
)


def test_register_all_task_runners_covers_required_task_types():
    register_all_task_runners()
    validate_required_task_runners()

    assert REQUIRED_TASK_TYPES.issubset(registered_task_types())

from backend.core.tasks.registry import (
    REQUIRED_TASK_TYPES,
    TaskHandlerRegistry,
    register_all_task_handlers,
    validate_required_task_handlers,
)


def test_register_all_task_handlers_covers_required_task_types():
    register_all_task_handlers()
    validate_required_task_handlers()

    assert REQUIRED_TASK_TYPES.issubset(TaskHandlerRegistry.registered_types())

from collections.abc import Awaitable, Callable
from importlib import import_module

from backend.core.task_catalog import required_task_types, task_types
from backend.models.task_model import Task


TaskRunner = Callable[[], Awaitable[None]]
TaskRunnerFactory = Callable[[Task], TaskRunner]


REQUIRED_TASK_TYPES = required_task_types()


_TASK_RUNNER_FACTORIES: dict[str, TaskRunnerFactory] = {}
_definitions_loaded = False


def register_task_runner(task_type: str, factory: TaskRunnerFactory) -> None:
    if task_type not in task_types():
        raise RuntimeError(f"Task runner is not in task catalog: '{task_type}'")
    existing = _TASK_RUNNER_FACTORIES.get(task_type)
    if existing is not None and existing is not factory:
        raise RuntimeError(f"Task runner already registered for '{task_type}'")
    _TASK_RUNNER_FACTORIES[task_type] = factory


def register_all_task_runners() -> None:
    global _definitions_loaded
    if _definitions_loaded:
        return
    import_module("backend.application.task_definitions")
    _definitions_loaded = True


def validate_required_task_runners() -> None:
    unknown = set(_TASK_RUNNER_FACTORIES) - task_types()
    if unknown:
        raise RuntimeError(
            f"Task runner definitions outside task catalog: {', '.join(sorted(unknown))}"
        )
    missing = REQUIRED_TASK_TYPES - set(_TASK_RUNNER_FACTORIES)
    if missing:
        raise RuntimeError(
            f"Missing task runner definitions for: {', '.join(sorted(missing))}"
        )


def build_task_runner(task: Task) -> TaskRunner:
    register_all_task_runners()
    factory = _TASK_RUNNER_FACTORIES.get(task.type)
    if factory is None:
        raise ValueError(f"No task runner definition found for task type: {task.type}")
    return factory(task)


def registered_task_types() -> set[str]:
    register_all_task_runners()
    return set(_TASK_RUNNER_FACTORIES)


def clear_task_runners() -> None:
    global _definitions_loaded
    _TASK_RUNNER_FACTORIES.clear()
    _definitions_loaded = False

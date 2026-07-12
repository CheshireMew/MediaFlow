from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from backend.core.task_catalog import task_types

if TYPE_CHECKING:
    from backend.models.task_model import Task


TaskRunner = Callable[[], Awaitable[None]]
TaskRunnerFactory = Callable[["Task"], TaskRunner]


class TaskRunnerRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, TaskRunnerFactory] = {}

    def register(self, task_type: str, factory: TaskRunnerFactory) -> None:
        if task_type not in task_types():
            raise RuntimeError(f"Task runner is not in task catalog: '{task_type}'")
        if task_type in self._factories:
            raise RuntimeError(f"Task runner already registered for '{task_type}'")
        self._factories[task_type] = factory

    def validate(self) -> None:
        unknown = set(self._factories) - task_types()
        if unknown:
            raise RuntimeError(
                f"Task runner definitions outside task catalog: {', '.join(sorted(unknown))}"
            )
        missing = task_types() - set(self._factories)
        if missing:
            raise RuntimeError(
                f"Missing task runner definitions for: {', '.join(sorted(missing))}"
            )

    def build(self, task: "Task") -> TaskRunner:
        factory = self._factories.get(task.type)
        if factory is None:
            raise ValueError(f"No task runner definition found for task type: {task.type}")
        return factory(task)

    def registered_task_types(self) -> set[str]:
        self.validate()
        return set(self._factories)

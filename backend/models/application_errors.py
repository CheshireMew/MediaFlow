from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ApplicationError(RuntimeError):
    """Stable application-layer failure that can cross an API boundary."""

    status_code = 500

    def __init__(
        self,
        message: str,
        *,
        code: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


class InvalidInputError(ApplicationError):
    status_code = 400


class ResourceNotFoundError(ApplicationError):
    status_code = 404


class ConflictError(ApplicationError):
    status_code = 409


class DependencyUnavailableError(ApplicationError):
    status_code = 503


class TaskConsistencyError(ApplicationError):
    status_code = 500


class TaskDeletionBlockedError(ConflictError):
    def __init__(self, task_ids: set[str]) -> None:
        self.task_ids = set(task_ids)
        super().__init__(
            "Tasks are still stopping and were not deleted: "
            + ", ".join(sorted(self.task_ids)),
            code="task_deletion_blocked",
            details={"task_ids": sorted(self.task_ids)},
        )


class ApiErrorResponse(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)

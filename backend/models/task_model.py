from typing import Optional, Dict, Any
from sqlmodel import Field, SQLModel, JSON, Column
import time
from pydantic import ConfigDict, field_validator

from backend.contracts import (
    TASK_CONTRACT_VERSION,
    TASK_LIFECYCLE,
    TASK_PERSISTENCE_SCOPES,
    TASK_SOURCES,
    TASK_STATUSES,
)
from backend.core.task_catalog import require_task_type


def task_timestamp_ms() -> int:
    return int(time.time() * 1000)


class Task(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: Optional[str] = Field(default=None) # User friendly name
    type: str
    status: str
    task_source: str = Field(default="backend")
    task_contract_version: int = Field(default=TASK_CONTRACT_VERSION)
    persistence_scope: str = Field(default="runtime")
    lifecycle: str = Field(default=TASK_LIFECYCLE["resumable"])
    progress: float = Field(default=0.0)
    message: str = Field(default="")
    created_at: int = Field(default_factory=task_timestamp_ms)
    
    # JSON Fields (Use explicit column type for SQLite compatibility)
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = Field(default=None)
    cancelled: bool = Field(default=False)
    request_params: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("type")
    @classmethod
    def validate_task_type(cls, value: str) -> str:
        return require_task_type(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError(f"Unknown task status: {value}")
        return value

    @field_validator("task_source")
    @classmethod
    def validate_task_source(cls, value: str) -> str:
        if value not in TASK_SOURCES:
            raise ValueError(f"Unknown task source: {value}")
        return value

    @field_validator("task_contract_version")
    @classmethod
    def validate_task_contract_version(cls, value: int) -> int:
        if value != TASK_CONTRACT_VERSION:
            raise ValueError(
                f"Unsupported task contract version: {value}; expected {TASK_CONTRACT_VERSION}"
            )
        return value

    @field_validator("persistence_scope")
    @classmethod
    def validate_persistence_scope(cls, value: str) -> str:
        if value not in TASK_PERSISTENCE_SCOPES:
            raise ValueError(f"Unknown task persistence scope: {value}")
        return value

    @field_validator("lifecycle")
    @classmethod
    def validate_lifecycle(cls, value: str) -> str:
        if value not in set(TASK_LIFECYCLE.values()):
            raise ValueError(f"Unknown task lifecycle: {value}")
        return value

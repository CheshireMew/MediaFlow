import time
from typing import Any

from pydantic import ConfigDict, field_validator, model_validator
from sqlalchemy import Integer, String
from sqlmodel import JSON, Column, Field, SQLModel

from backend.contracts import (
    TASK_CONTRACT_VERSION,
    TASK_LIFECYCLE,
    TASK_PERSISTENCE_SCOPES,
    TASK_SOURCES,
    TASK_STATUSES,
    require_task_message_code,
    require_task_type,
)


def task_timestamp_ms() -> int:
    return int(time.time() * 1000)


class Task(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str | None = Field(default=None) # User friendly name
    type: str
    status: str
    task_source: str = Field(default="backend")
    task_contract_version: int = Field(default=TASK_CONTRACT_VERSION)
    persistence_scope: str = Field(default="runtime")
    lifecycle: str = Field(default=TASK_LIFECYCLE["resumable"])
    progress: float = Field(default=0.0)
    revision: int = Field(
        default=0,
        ge=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    message_code: str = Field(default="queued")
    message_params: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    primary_operation: str = Field(
        default="",
        sa_column=Column(String, nullable=False, server_default=""),
    )
    summary_artifacts: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    created_at: int = Field(default_factory=task_timestamp_ms)
    
    # JSON Fields (Use explicit column type for SQLite compatibility)
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    error: str | None = Field(default=None)
    cancelled: bool = Field(default=False)
    request_params: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    checkpoint: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

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

    @field_validator("message_code")
    @classmethod
    def validate_message_code(cls, value: str) -> str:
        return require_task_message_code(value)

    @model_validator(mode="after")
    def validate_message_descriptor(self):
        from backend.models.task_message import validate_task_message

        self.message_code, self.message_params = validate_task_message(
            self.message_code,
            self.message_params,
        )
        return self

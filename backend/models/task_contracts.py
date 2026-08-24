from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from backend.contracts import require_task_message_code
from backend.models.media_contracts import TaskArtifact, TaskResult
from backend.models.pipeline_contracts import PipelineRequest

TaskMessageCode = Annotated[str, AfterValidator(require_task_message_code)]
TaskMessageParams = dict[str, str | int | float | bool | None]


class TaskSubmissionMetadata(BaseModel):
    task_source: Literal["backend"]
    task_contract_version: int
    persistence_scope: str
    lifecycle: str
    queue_state: str
    queue_position: int | None
    primary_operation: str
    revision: int


class TaskResponse(TaskSubmissionMetadata):
    task_id: str
    status: str
    message_code: TaskMessageCode
    message_params: TaskMessageParams


class TaskActionResponse(BaseModel):
    message_code: TaskMessageCode
    message_params: TaskMessageParams


class TaskStatusActionResponse(TaskActionResponse):
    status: str


class TaskCountActionResponse(TaskActionResponse):
    count: int


class TaskDeleteActionResponse(TaskActionResponse):
    task_id: str


class TaskQueueSummary(BaseModel):
    max_concurrent: int
    running: int
    queued: int


class HealthResponse(BaseModel):
    status: Literal["starting", "ready", "failed"]
    service: str
    version: str
    error: str | None = None


class TaskSummaryView(BaseModel):
    id: str
    type: str
    status: str
    task_source: Literal["backend"]
    task_contract_version: int
    persistence_scope: str
    lifecycle: str
    progress: float
    revision: int
    name: str | None = None
    message_code: TaskMessageCode
    message_params: TaskMessageParams
    error: str | None = None
    primary_operation: str
    artifacts: list[TaskArtifact] = Field(default_factory=list)
    created_at: int
    queue_state: str
    queue_position: int | None = None


class TaskView(TaskSummaryView):
    """Full task detail returned only by the single-task endpoint."""

    result: TaskResult | None = None
    request_params: PipelineRequest | None = None

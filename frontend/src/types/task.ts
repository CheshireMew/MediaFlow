import type {
  ClipCandidate as GeneratedClipCandidate,
  PipelineRequest,
  SubtitleSegment as GeneratedSubtitleSegment,
  TaskResult as GeneratedTaskResult,
  TaskExecutionTraceItem,
  TaskView,
} from "./generatedApi";
import type { TaskType } from "../contracts/generatedTaskCatalog";
import type {
  TaskLifecycle,
  TaskMessageCode,
  TaskPersistenceScope,
  TaskQueueState,
  TaskSource,
  TaskStatus,
} from "../contracts/runtimeContracts";
export type { TaskType } from "../contracts/generatedTaskCatalog";
export type { TaskStatus } from "../contracts/runtimeContracts";

export type SubtitleSegment = GeneratedSubtitleSegment;
export type ClipCandidate = GeneratedClipCandidate;

export type TaskTraceItem = TaskExecutionTraceItem;
export type { TaskArtifact } from "./generatedApi";

export type TaskRequestParams = PipelineRequest;
export type TaskResult = GeneratedTaskResult;

export interface Task extends Omit<
  TaskView,
  | "type"
  | "status"
  | "task_source"
  | "task_contract_version"
  | "persistence_scope"
  | "lifecycle"
  | "result"
  | "request_params"
  | "queue_state"
  | "name"
  | "message_code"
  | "message_params"
  | "error"
  | "revision"
> {
  type: TaskType;
  status: TaskStatus;
  task_source: TaskSource;
  task_contract_version: number;
  persistence_scope: TaskPersistenceScope;
  lifecycle: TaskLifecycle;
  name?: string;
  message_code: TaskMessageCode;
  message_params: Record<string, string | number | boolean | null>;
  error?: string | null;
  revision?: number;
  result?: TaskResult | null;
  request_params?: TaskRequestParams | null;
  queue_state: TaskQueueState;
}

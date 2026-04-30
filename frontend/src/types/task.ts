import type {
  TaskFileRef as FileRef,
  TaskMediaRef,
  TaskResultShape,
  TaskTraceItem,
} from "../contracts/taskContract";
import type { PipelineRequest } from "./generatedApi";
import type { TaskView } from "./generatedApi";
import type { TaskType } from "../contracts/generatedTaskCatalog";
import type {
  TaskLifecycle,
  TaskPersistenceScope,
  TaskQueueState,
  TaskSource,
  TaskStatus,
} from "../contracts/runtimeContracts";
export type { TaskType } from "../contracts/generatedTaskCatalog";
export type { TaskStatus } from "../contracts/runtimeContracts";

export interface SubtitleSegment {
  id: number | string;
  start: number;
  end: number;
  text: string;
}

export type TaskStep = PipelineRequest["steps"][number];

export type { FileRef, TaskMediaRef, TaskTraceItem };

export interface TaskMeta {
  segments?: SubtitleSegment[];
  text?: string;
  transcript?: string;
  language?: string;
  video_ref?: TaskMediaRef | null;
  subtitle_ref?: TaskMediaRef | null;
  context_ref?: TaskMediaRef | null;
  output_ref?: TaskMediaRef | null;
  execution_trace?: TaskTraceItem[];
  [key: string]: unknown;
}

export interface TaskRequestParams {
  steps?: PipelineRequest["steps"];
  video_ref?: TaskMediaRef | null;
  subtitle_ref?: TaskMediaRef | null;
  context_ref?: TaskMediaRef | null;
  output_ref?: TaskMediaRef | null;
  mode?: string;
  url?: string;
  [key: string]: unknown;
}

export interface TaskResult extends Omit<TaskResultShape, "segments" | "meta"> {
  files?: FileRef[];
  segments?: SubtitleSegment[];
  meta?: TaskMeta;
}

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
  | "message"
  | "error"
> {
  type: TaskType;
  status: TaskStatus;
  task_source: TaskSource;
  task_contract_version: number;
  persistence_scope: TaskPersistenceScope;
  lifecycle: TaskLifecycle;
  name?: string;
  message?: string;
  error?: string | null;
  result?: TaskResult;
  request_params?: TaskRequestParams;
  queue_state: TaskQueueState;
}

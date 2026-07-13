import type { TaskTraceItem } from "../contracts/taskContract";
import type { PipelineRequest } from "./generatedApi";
import type {
  ClipCandidate as GeneratedClipCandidate,
  MediaReference,
  SubtitleSegment as GeneratedSubtitleSegment,
  TaskResult as GeneratedTaskResult,
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

export type { TaskTraceItem };
export type { TaskArtifact } from "./generatedApi";

export interface TaskMeta {
  segments?: SubtitleSegment[];
  text?: string;
  transcript?: string;
  language?: string;
  execution_trace?: TaskTraceItem[];
  [key: string]: unknown;
}

export interface TaskRequestParams {
  steps?: PipelineRequest["steps"];
  video_ref?: MediaReference | null;
  srt_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
  context_ref?: MediaReference | null;
  output_ref?: MediaReference | null;
  mode?: string;
  url?: string;
  [key: string]: unknown;
}

export interface TaskResult extends Omit<GeneratedTaskResult, "meta"> {
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
  result?: TaskResult;
  request_params?: TaskRequestParams;
  queue_state: TaskQueueState;
}

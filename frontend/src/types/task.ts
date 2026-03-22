import type {
  TaskFileRef as FileRef,
  TaskMediaRef,
  TaskMetaLegacyPathMirrors,
  TaskRequestLegacyPathMirrors,
  TaskResultShape,
  TaskTraceItem,
} from "../contracts/taskContract";

export interface SubtitleSegment {
  id: number | string;
  start: number;
  end: number;
  text: string;
}

export interface TaskStep {
  step_name?: string;
  action?: string;
  params?: Record<string, unknown>;
}

export type { FileRef, TaskMediaRef, TaskMetaLegacyPathMirrors, TaskRequestLegacyPathMirrors, TaskTraceItem };

export interface TaskMeta extends TaskMetaLegacyPathMirrors {
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

export interface TaskRequestParams extends TaskRequestLegacyPathMirrors {
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

export type TaskType =
  | "download"
  | "transcribe"
  | "transcribe_segment"
  | "translate"
  | "pipeline"
  | "synthesize"
  | "synthesis"
  | "enhancement"
  | "cleanup"
  | "extract";

export type TaskStatus =
  | "pending"
  | "running"
  | "processing_result"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  task_source?: "desktop" | "backend";
  task_contract_version?: number;
  task_contract_normalized_from_legacy?: boolean;
  persistence_scope?: "runtime" | "history";
  lifecycle?: import("../contracts/runtimeContracts").TaskLifecycle;
  progress: number;
  name?: string;
  message?: string;
  error?: string;
  result?: TaskResult;
  request_params?: TaskRequestParams;
  created_at: number;
  queue_state?: "queued" | "running" | "paused" | "cancelled" | "completed" | "failed" | "idle";
  queue_position?: number | null;
}

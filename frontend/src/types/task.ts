export interface SubtitleSegment {
  id: number | string;
  start: number;
  end: number;
  text: string;
}

export interface FileRef {
  type: string; // "video", "audio", "subtitle", "image"
  path: string;
  label?: string;
  mime_type?: string;
}

export type TaskMeta = Record<string, unknown>;

export type TaskRequestParams = Record<string, unknown>;

export interface TaskResult {
  success: boolean;
  files: FileRef[];
  meta: TaskMeta;
  error?: string;
}

export interface Task {
  id: string;
  type:
    | "download"
    | "transcribe"
    | "transcribe_segment"
    | "translate"
    | "pipeline"
    | "synthesis"
    | "enhancement"
    | "cleanup"
    | "extract";
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "paused";
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

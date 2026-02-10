export interface SubtitleSegment {
  id: number | string;
  start: number;
  end: number;
  text: string;
}

export interface Task {
  id: string;
  type: "download" | "transcribe" | "translate" | "pipeline" | "synthesis";
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
  result?: any;
  request_params?: any;
  created_at: number;
}

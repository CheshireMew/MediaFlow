import type { MediaReference } from "../services/ui/mediaReference";

export type TaskMediaRef = MediaReference;

export interface TaskFileRef {
  type: string;
  path: string;
  label?: string;
  mime_type?: string;
}

export interface TaskTraceItem {
  step: string;
  duration: number;
  status: string;
  error?: string;
  timestamp: number;
}

export interface TaskStructuredMediaRefs {
  video_ref?: TaskMediaRef | null;
  subtitle_ref?: TaskMediaRef | null;
  context_ref?: TaskMediaRef | null;
  output_ref?: TaskMediaRef | null;
}

export interface TaskResultShape extends TaskStructuredMediaRefs {
  success?: boolean;
  files?: TaskFileRef[];
  segments?: Array<{ id: number | string; start: number; end: number; text: string }>;
  text?: string;
  language?: string;
  error?: string;
  meta?: (TaskStructuredMediaRefs & {
      segments?: Array<{ id: number | string; start: number; end: number; text: string }>;
      text?: string;
      transcript?: string;
      language?: string;
      execution_trace?: TaskTraceItem[];
      [key: string]: unknown;
    });
}

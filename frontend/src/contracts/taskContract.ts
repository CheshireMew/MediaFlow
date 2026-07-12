export interface TaskTraceItem {
  step: string;
  duration: number;
  status: string;
  error?: string;
  timestamp: number;
}

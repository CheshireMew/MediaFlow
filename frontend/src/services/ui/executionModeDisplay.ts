import type { ExecutionMode } from "../domain/taskSubmission";

type ExecutionModeDisplay = {
  label: string;
  className: string;
};

const EXECUTION_MODE_DISPLAY: Record<ExecutionMode, ExecutionModeDisplay> = {
  task_submission: {
    label: "queued task",
    className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  },
  direct_result: {
    label: "direct result",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
};

export function getExecutionModeDisplay(mode: ExecutionMode): ExecutionModeDisplay {
  return EXECUTION_MODE_DISPLAY[mode];
}

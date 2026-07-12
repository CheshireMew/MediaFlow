import type { ExecutionMode } from "../domain/taskSubmission";

type ExecutionModeDisplay = {
  labelKey: "executionMode.taskSubmission";
  className: string;
};

const EXECUTION_MODE_DISPLAY: Record<ExecutionMode, ExecutionModeDisplay> = {
  task_submission: {
    labelKey: "executionMode.taskSubmission",
    className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  },
};

export function getExecutionModeDisplay(mode: ExecutionMode): ExecutionModeDisplay {
  return EXECUTION_MODE_DISPLAY[mode];
}

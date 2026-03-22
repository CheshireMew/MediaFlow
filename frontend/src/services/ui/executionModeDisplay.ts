import type { RuntimeExecutionMode } from "../../stores/runtimeExecutionStore";

type ExecutionModeDisplay = {
  label: string;
  className: string;
};

const EXECUTION_MODE_DISPLAY: Record<RuntimeExecutionMode, ExecutionModeDisplay> = {
  task_submission: {
    label: "task_submission",
    className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  },
  direct_result: {
    label: "direct_result",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
};

export function getExecutionModeDisplay(mode: RuntimeExecutionMode): ExecutionModeDisplay {
  return EXECUTION_MODE_DISPLAY[mode];
}

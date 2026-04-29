import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import type {
  ExecutionOutcome,
  NullableExecutionMode,
  TaskExecutionSubmission,
} from "./taskSubmission";
import {
  createTaskFromExecutionOutcome,
  getExecutionSubmission,
} from "./taskSubmission";

export type ExecutionTaskDescriptor = {
  type: TaskType;
  name?: string;
  request_params?: TaskRequestParams;
  created_at?: number;
};

export function applyExecutionOutcome(args: {
  outcome: ExecutionOutcome;
  setExecutionMode?: (mode: NullableExecutionMode) => void;
}): TaskExecutionSubmission {
  const submission = getExecutionSubmission(args.outcome);
  args.setExecutionMode?.("task_submission");
  return submission;
}

export function enqueueExecutionTask(args: {
  addTask: (task: Task) => void;
  outcome: ExecutionOutcome;
  descriptor: ExecutionTaskDescriptor;
}): TaskExecutionSubmission {
  args.addTask(
    createTaskFromExecutionOutcome({
      outcome: args.outcome,
      ...args.descriptor,
    }),
  );

  return getExecutionSubmission(args.outcome);
}

import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import type {
  ExecutionOutcome,
  ExecutionOutcomeBranch,
  NullableExecutionMode,
  TaskExecutionSubmission,
} from "./taskSubmission";
import {
  createTaskFromExecutionOutcome,
  resolveExecutionOutcomeBranch,
} from "./taskSubmission";

export type ExecutionTaskDescriptor = {
  type: TaskType;
  name?: string;
  request_params?: TaskRequestParams;
  created_at?: number;
};

export function applyExecutionOutcome<TResult>(args: {
  outcome: ExecutionOutcome<TResult>;
  setExecutionMode?: (mode: NullableExecutionMode) => void;
}): ExecutionOutcomeBranch<TResult> {
  const branch = resolveExecutionOutcomeBranch(args.outcome);
  args.setExecutionMode?.(branch.executionMode);
  return branch;
}

export function enqueueExecutionTask(args: {
  addTask: (task: Task) => void;
  outcome: ExecutionOutcome<unknown>;
  descriptor: ExecutionTaskDescriptor;
}): TaskExecutionSubmission {
  const branch = resolveExecutionOutcomeBranch(args.outcome);
  if (branch.kind !== "submission") {
    throw new Error("Execution outcome did not return a task submission");
  }

  args.addTask(
    createTaskFromExecutionOutcome({
      outcome: args.outcome,
      ...args.descriptor,
    }),
  );

  return branch.submission;
}

import type { Task, TaskRequestParams, TaskType } from "../../../types/task";
import type { ExecutionOutcome } from "../../domain";

export type RetryDescriptor = {
  type: TaskType;
  request_params: TaskRequestParams;
  name?: string;
  created_at?: number;
};

export type RetrySubmission = {
  outcome: ExecutionOutcome<unknown>;
  descriptor: RetryDescriptor;
};

export type RetryHandler = {
  accepts: (task: Task) => boolean;
  submit: (task: Task) => Promise<RetrySubmission | null>;
};


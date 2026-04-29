import type { Task } from "../../../types/task";
import { createTaskFromExecutionOutcome } from "../../domain";
import { getRetryHandler } from "./registry";

export function canRetryTask(task: Task) {
  if (task.status !== "failed") {
    return false;
  }
  return Boolean(getRetryHandler(task));
}

export async function retryFailedTask(task: Task, addTask: (task: Task) => void) {
  const submission = await getRetryHandler(task)?.submit(task);

  if (!submission) {
    throw new Error(`Retry is not available for task type "${task.type}"`);
  }

  addTask(
    createTaskFromExecutionOutcome({
      outcome: submission.outcome,
      type: submission.descriptor.type,
      name: submission.descriptor.name,
      request_params: submission.descriptor.request_params,
      created_at: submission.descriptor.created_at,
    }),
  );
}


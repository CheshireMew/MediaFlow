import type { Task } from "../../../types/task";

export function canRetryTask(task: Task) {
  if (task.status !== "failed") {
    return false;
  }
  return Boolean(task.request_params);
}

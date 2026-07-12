import {
  getTaskQueueState,
  isRuntimeTaskActive,
  isRuntimeTaskRunning,
} from "../../contracts/runtimeContracts";
import type { Task } from "../../types/task";

export function isTaskActive(task: Task) {
  return isRuntimeTaskActive(task.status);
}

export function isTaskQueued(task: Task) {
  return task.queue_state === "queued" || getTaskQueueState(task.status) === "queued";
}

export function isTaskRunning(task: Task) {
  return task.queue_state === "running" || isRuntimeTaskRunning(task.status);
}

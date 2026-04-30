import {
  TASK_LIFECYCLE,
  getTaskQueueState,
  isRuntimeTaskActive,
  isRuntimeTaskRunning,
  type TaskLifecycle,
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

export function isTaskPaused(task: Task) {
  return task.queue_state === "paused" || getTaskQueueState(task.status) === "paused";
}

export function isTaskTerminal(task: Task) {
  return !isRuntimeTaskActive(task.status);
}

export function isTaskHistoryEntry(task: Task) {
  return (
    task.persistence_scope === "history" ||
    task.lifecycle === TASK_LIFECYCLE.history_only
  );
}

export function getTaskLifecycleKind(task: Task): TaskLifecycle {
  return task.lifecycle;
}

import { TASK_LIFECYCLE, type TaskLifecycle } from "../../contracts/runtimeContracts";
import type { Task, TaskStatus } from "../../types/task";

export const ACTIVE_TASK_STATUSES = new Set<TaskStatus>([
  "pending",
  "running",
  "paused",
  "processing_result",
]);

export const QUEUED_TASK_STATUSES = new Set<TaskStatus>(["pending"]);
export const RUNNING_TASK_STATUSES = new Set<TaskStatus>(["running", "processing_result"]);
export const PAUSED_TASK_STATUSES = new Set<TaskStatus>(["paused"]);
export const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function isTaskActive(task: Task) {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export function isTaskQueued(task: Task) {
  return task.queue_state === "queued" || QUEUED_TASK_STATUSES.has(task.status);
}

export function isTaskRunning(task: Task) {
  return task.queue_state === "running" || RUNNING_TASK_STATUSES.has(task.status);
}

export function isTaskPaused(task: Task) {
  return task.queue_state === "paused" || PAUSED_TASK_STATUSES.has(task.status);
}

export function isTaskTerminal(task: Task) {
  return TERMINAL_TASK_STATUSES.has(task.status);
}

export function isTaskHistoryEntry(task: Task) {
  return (
    task.persistence_scope === "history" ||
    task.lifecycle === TASK_LIFECYCLE.history_only
  );
}

export function isTaskRecoverable(task: Task) {
  return task.lifecycle === TASK_LIFECYCLE.resumable || isTaskActive(task);
}

export function getTaskLifecycleKind(task: Task): TaskLifecycle | null {
  return task.lifecycle ?? null;
}

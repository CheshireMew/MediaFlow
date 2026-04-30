import type { Task } from "../../types/task";
import type { TaskSocketMessage } from "../../hooks/tasks/useTaskStore";
import {
  TASK_CONTRACT_VERSION,
  type TaskOwnerMode,
} from "../../contracts/runtimeContracts";
import { reportTaskSourceIssue } from "./diagnostics";

export const SUPPORTED_TASK_CONTRACT_VERSION = TASK_CONTRACT_VERSION;
const warnedTaskContracts = new Set<string>();

export function hasSupportedTaskContract(task: Task) {
  return task.task_contract_version === SUPPORTED_TASK_CONTRACT_VERSION;
}

export function normalizeTaskContract(task: Task): Task {
  const taskSource = task.task_source;
  return {
    ...task,
    task_source: taskSource,
    task_contract_version: task.task_contract_version,
    lifecycle: task.lifecycle,
  };
}

export function normalizeTaskForOwnerMode(
  task: Task,
  source: string,
  ownerMode: TaskOwnerMode,
): Task | null {
  const normalizedTask = normalizeTaskContract(task);
  if (ownerMode === "backend" && normalizedTask.task_source === "backend") {
    return normalizedTask;
  }

  reportTaskSourceIssue({
    reason: "owner_mode",
    source,
    taskId: normalizedTask.id,
    expected: ownerMode,
    received: normalizedTask.task_source,
    ownerMode,
  });
  console.warn(
    `[TaskOwnerMode] Ignoring task ${normalizedTask.id} from ${source}. ` +
      `Owner mode ${ownerMode} does not accept ${normalizedTask.task_source} tasks.`,
  );
  return null;
}

export function normalizeTaskForRenderer(
  task: Task,
  source: string,
  ownerMode?: TaskOwnerMode,
): Task | null {
  const normalizedTask = normalizeTaskContract(task);
  if (hasSupportedTaskContract(normalizedTask)) {
    if (!ownerMode) {
      return normalizedTask;
    }
    return normalizeTaskForOwnerMode(normalizedTask, source, ownerMode);
  }

  const warningKey = `${source}:${normalizedTask.id}:${normalizedTask.task_contract_version}`;
  if (!warnedTaskContracts.has(warningKey)) {
    warnedTaskContracts.add(warningKey);
    reportTaskSourceIssue({
      reason: "contract_version",
      source,
      taskId: normalizedTask.id,
      expected: String(SUPPORTED_TASK_CONTRACT_VERSION),
      received: String(normalizedTask.task_contract_version),
      ownerMode,
    });
    console.warn(
      `[TaskContract] Ignoring incompatible task ${normalizedTask.id} from ${source}. ` +
        `Expected version ${SUPPORTED_TASK_CONTRACT_VERSION}, received ${normalizedTask.task_contract_version}.`,
    );
  }

  return null;
}

export function applyTaskSnapshot(
  clearTasks: (predicate: (task: Task) => boolean) => void,
  applyMessage: (message: TaskSocketMessage) => void,
  clearPredicate: (task: Task) => boolean,
  tasks: Task[],
  ownerMode?: TaskOwnerMode,
) {
  clearTasks(clearPredicate);
  tasks.forEach((task) => {
    const normalizedTask = normalizeTaskForRenderer(task, "snapshot", ownerMode);
    if (!normalizedTask) {
      return;
    }
    applyMessage({
      type: "update",
      task: normalizedTask,
    });
  });
}

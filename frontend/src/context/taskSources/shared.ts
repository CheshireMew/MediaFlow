import type { Task } from "../../types/task";
import type { TaskSocketMessage } from "../../hooks/tasks/useTaskStore";
import {
  getTaskLifecycle,
  TASK_CONTRACT_VERSION,
  type TaskOwnerMode,
} from "../../contracts/runtimeContracts";
import { reportTaskSourceIssue } from "./diagnostics";
import { normalizeLegacyTaskMediaContract } from "../../services/tasks/taskMediaResolver";
import { isTaskActive } from "../../services/tasks/taskRuntimeState";

export const SUPPORTED_TASK_CONTRACT_VERSION = TASK_CONTRACT_VERSION;
const warnedTaskContracts = new Set<string>();

export function isDesktopTask(task: Task) {
  return Boolean(
    task.request_params &&
      typeof task.request_params === "object" &&
      "__desktop_worker" in task.request_params &&
      task.request_params.__desktop_worker === true,
  );
}

export function hasActiveRemoteTasks(tasks: Task[]) {
  return tasks.some((task) => !isDesktopTask(task) && isTaskActive(task));
}

export function hasSupportedTaskContract(task: Task) {
  return (task.task_contract_version ?? SUPPORTED_TASK_CONTRACT_VERSION) === SUPPORTED_TASK_CONTRACT_VERSION;
}

export function normalizeTaskContract(task: Task): Task {
  const { task: legacyNormalizedTask, normalizedFromLegacy } =
    normalizeLegacyTaskMediaContract(task);
  const taskSource =
    legacyNormalizedTask.task_source ??
    (isDesktopTask(legacyNormalizedTask) ? "desktop" : "backend");
  const persistenceScope = legacyNormalizedTask.persistence_scope ?? "runtime";
  return {
    ...legacyNormalizedTask,
    task_source: taskSource,
    task_contract_version:
      legacyNormalizedTask.task_contract_version ?? SUPPORTED_TASK_CONTRACT_VERSION,
    task_contract_normalized_from_legacy: normalizedFromLegacy,
    lifecycle:
      legacyNormalizedTask.lifecycle ??
      getTaskLifecycle({
        taskSource,
        persistenceScope,
        status: legacyNormalizedTask.status,
      }),
  };
}

export function getTaskSourceOwnerMode(task: Task): "desktop" | "backend" {
  return isDesktopTask(task) || task.task_source === "desktop" ? "desktop" : "backend";
}

export function isTaskAllowedInOwnerMode(task: Task, ownerMode: TaskOwnerMode) {
  if (ownerMode === "hybrid") {
    return true;
  }
  return getTaskSourceOwnerMode(task) === ownerMode;
}

export function normalizeTaskForOwnerMode(
  task: Task,
  source: string,
  ownerMode: TaskOwnerMode,
): Task | null {
  const normalizedTask = normalizeTaskContract(task);
  if (isTaskAllowedInOwnerMode(normalizedTask, ownerMode)) {
    return normalizedTask;
  }

  reportTaskSourceIssue({
    reason: "owner_mode",
    source,
    taskId: normalizedTask.id,
    expected: ownerMode,
    received: getTaskSourceOwnerMode(normalizedTask),
    ownerMode,
  });
  console.warn(
    `[TaskOwnerMode] Ignoring task ${normalizedTask.id} from ${source}. ` +
      `Owner mode ${ownerMode} does not accept ${getTaskSourceOwnerMode(normalizedTask)} tasks.`,
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

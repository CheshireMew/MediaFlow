import type { Task } from "../../types/task";
import { TASK_CONTRACT_VERSION } from "../../contracts/runtimeContracts";
import { reportTaskSourceIssue } from "./diagnostics";

export const SUPPORTED_TASK_CONTRACT_VERSION = TASK_CONTRACT_VERSION;
const SUPPORTED_TASK_SOURCE = "backend";
const warnedTaskContracts = new Set<string>();
const warnedTaskSources = new Set<string>();

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

export function normalizeTaskForRenderer(
  task: Task,
  source: string,
): Task | null {
  const normalizedTask = normalizeTaskContract(task);
  if (!hasSupportedTaskContract(normalizedTask)) {
    const warningKey = `${source}:${normalizedTask.id}:${normalizedTask.task_contract_version}`;
    if (!warnedTaskContracts.has(warningKey)) {
      warnedTaskContracts.add(warningKey);
      reportTaskSourceIssue({
        reason: "contract_version",
        source,
        taskId: normalizedTask.id,
        expected: String(SUPPORTED_TASK_CONTRACT_VERSION),
        received: String(normalizedTask.task_contract_version),
      });
      console.warn(
        `[TaskContract] Ignoring incompatible task ${normalizedTask.id} from ${source}. ` +
          `Expected version ${SUPPORTED_TASK_CONTRACT_VERSION}, received ${normalizedTask.task_contract_version}.`,
      );
    }

    return null;
  }

  if (normalizedTask.task_source !== SUPPORTED_TASK_SOURCE) {
    const warningKey = `${source}:${normalizedTask.id}:${normalizedTask.task_source}`;
    if (!warnedTaskSources.has(warningKey)) {
      warnedTaskSources.add(warningKey);
      reportTaskSourceIssue({
        reason: "task_source",
        source,
        taskId: normalizedTask.id,
        expected: SUPPORTED_TASK_SOURCE,
        received: normalizedTask.task_source,
      });
      console.warn(
        `[TaskSource] Ignoring task ${normalizedTask.id} from ${source}. ` +
          `Expected source ${SUPPORTED_TASK_SOURCE}, received ${normalizedTask.task_source}.`,
      );
    }
    return null;
  }

  return normalizedTask;
}

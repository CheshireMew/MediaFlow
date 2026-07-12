import type { Task } from "../../types/task";
import {
  TASK_CONTRACT_VERSION,
  isTaskMessageCode,
} from "../../contracts/runtimeContracts";
import { reportTaskSourceIssue } from "./diagnostics";

export const SUPPORTED_TASK_CONTRACT_VERSION = TASK_CONTRACT_VERSION;
const SUPPORTED_TASK_SOURCE = "backend";
const warnedTaskContracts = new Set<string>();
const warnedTaskSources = new Set<string>();
const warnedTaskMessages = new Set<string>();

function hasValidTaskMessageParams(value: unknown): value is Task["message_params"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) =>
    item === null || ["string", "number", "boolean"].includes(typeof item),
  );
}

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

  if (!isTaskMessageCode(normalizedTask.message_code)) {
    const warningKey = `${source}:${normalizedTask.id}:code:${String(normalizedTask.message_code)}`;
    if (!warnedTaskMessages.has(warningKey)) {
      warnedTaskMessages.add(warningKey);
      reportTaskSourceIssue({
        reason: "message_code",
        source,
        taskId: normalizedTask.id,
        expected: "catalog message code",
        received: String(normalizedTask.message_code),
      });
    }
    return null;
  }

  if (!hasValidTaskMessageParams(normalizedTask.message_params)) {
    const warningKey = `${source}:${normalizedTask.id}:params`;
    if (!warnedTaskMessages.has(warningKey)) {
      warnedTaskMessages.add(warningKey);
      reportTaskSourceIssue({
        reason: "message_params",
        source,
        taskId: normalizedTask.id,
        expected: "scalar message params",
        received: typeof normalizedTask.message_params,
      });
    }
    return null;
  }

  return normalizedTask;
}

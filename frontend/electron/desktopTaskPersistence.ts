import type { Task } from "../src/types/task";
import { TASK_LIFECYCLE } from "../src/contracts/runtimeContracts";
import { normalizeLegacyTaskMediaContract } from "../src/services/tasks/taskMediaResolver";

export const DESKTOP_TASK_PERSISTENCE_SCHEMA_VERSION = 1;
const MAX_DESKTOP_TASK_HISTORY = 100;

type PersistedDesktopTaskRecord = {
  record_type: "history";
  task: Task;
};

type PersistedDesktopTaskState = {
  schema_version: number;
    runtime_policy: {
      active_tasks: "runtime-only";
      paused_tasks: "runtime-only";
      queued_tasks: "runtime-only";
      history_tasks: "history-only";
    };
  history: PersistedDesktopTaskRecord[];
};

function isDesktopWorkerTask(task: Task) {
  return Boolean(
    task &&
      typeof task === "object" &&
      task.request_params &&
      typeof task.request_params === "object" &&
      "__desktop_worker" in task.request_params &&
      task.request_params.__desktop_worker === true,
  );
}

function isTerminalDesktopTask(task: Task) {
  return ["completed", "failed", "cancelled"].includes(task.status);
}

function withHistoryScope(task: Task): Task {
  return {
    ...task,
    persistence_scope: "history",
    lifecycle: TASK_LIFECYCLE.history_only,
  };
}

function normalizePersistedDesktopTask(task: Task): Task {
  return withHistoryScope(normalizeLegacyTaskMediaContract(task).task);
}

export function normalizePersistedDesktopTaskHistory(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => isDesktopWorkerTask(task) && isTerminalDesktopTask(task))
    .map(normalizePersistedDesktopTask)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, MAX_DESKTOP_TASK_HISTORY);
}

export function parsePersistedDesktopTaskHistory(raw: string): Task[] {
  const parsed = JSON.parse(raw) as PersistedDesktopTaskState | Task[];

  if (Array.isArray(parsed)) {
    return normalizePersistedDesktopTaskHistory(parsed);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.schema_version !== DESKTOP_TASK_PERSISTENCE_SCHEMA_VERSION ||
    !Array.isArray(parsed.history)
  ) {
    return [];
  }

  return normalizePersistedDesktopTaskHistory(
    parsed.history
      .filter(
        (record): record is PersistedDesktopTaskRecord =>
          Boolean(record) &&
          typeof record === "object" &&
          record.record_type === "history" &&
          Boolean(record.task),
      )
      .map((record) => record.task),
  );
}

export function serializePersistedDesktopTaskHistory(tasks: Task[]) {
  const normalizedHistory = normalizePersistedDesktopTaskHistory(tasks);
  const payload: PersistedDesktopTaskState = {
    schema_version: DESKTOP_TASK_PERSISTENCE_SCHEMA_VERSION,
    runtime_policy: {
      active_tasks: "runtime-only",
      paused_tasks: "runtime-only",
      queued_tasks: "runtime-only",
      history_tasks: "history-only",
    },
    history: normalizedHistory.map((task) => ({
      record_type: "history",
      task,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

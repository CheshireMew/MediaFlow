import type { Task } from "../src/types/task";
import { TASK_LIFECYCLE } from "../src/contracts/runtimeContracts";
import { createMediaReference } from "../src/services/ui/mediaReference";

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

function createTaskMediaRef(filePath: unknown, type?: string) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return null;
  }

  return createMediaReference({
    path: filePath.trim(),
    type,
    origin: "task",
  });
}

function normalizeLegacyDesktopHistoryTask(task: Task): Task {
  if (task.type !== "translate") {
    return {
      ...task,
      task_contract_normalized_from_legacy:
        task.task_contract_normalized_from_legacy ?? false,
    };
  }

  const requestParams =
    task.request_params && typeof task.request_params === "object"
      ? { ...task.request_params }
      : null;
  const result =
    task.result && typeof task.result === "object"
      ? {
          ...task.result,
          meta:
            task.result.meta && typeof task.result.meta === "object"
              ? { ...task.result.meta }
              : {},
        }
      : task.result;
  const resultMeta =
    result && typeof result === "object" && result.meta && typeof result.meta === "object"
      ? result.meta
      : null;

  let normalizedFromLegacy = task.task_contract_normalized_from_legacy === true;
  const legacySourcePath =
    typeof requestParams?.context_path === "string"
      ? requestParams.context_path
      : null;
  if (requestParams && legacySourcePath) {
    if (!requestParams.context_ref) {
      requestParams.context_ref = createTaskMediaRef(
        legacySourcePath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
    if (!requestParams.subtitle_ref) {
      requestParams.subtitle_ref = createTaskMediaRef(
        legacySourcePath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
  }

  const legacyOutputPath =
    typeof resultMeta?.srt_path === "string"
      ? resultMeta.srt_path
      : Array.isArray(result?.files)
        ? (
            result.files.find(
              (file) =>
                file &&
                typeof file === "object" &&
                file.type === "subtitle" &&
                typeof file.path === "string",
            )?.path ?? null
          )
        : null;
  if (resultMeta && legacyOutputPath) {
    if (!resultMeta.subtitle_ref) {
      resultMeta.subtitle_ref = createTaskMediaRef(
        legacyOutputPath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
    if (!resultMeta.output_ref) {
      resultMeta.output_ref = createTaskMediaRef(
        legacyOutputPath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
  }

  return {
    ...task,
    task_contract_normalized_from_legacy: normalizedFromLegacy,
    request_params: requestParams ?? task.request_params,
    result,
  };
}

function normalizePersistedDesktopTask(task: Task): Task {
  return withHistoryScope(normalizeLegacyDesktopHistoryTask(task));
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

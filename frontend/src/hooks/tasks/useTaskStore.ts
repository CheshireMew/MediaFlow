import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import type { Task } from "../../types/task";
import { normalizeTaskForRenderer } from "../../context/taskSources/shared";

export type TaskSocketMessage =
  | { type: "snapshot"; tasks: Task[]; stream_id: string; sequence: number }
  | { type: "update"; task: Task; stream_id: string; sequence: number }
  | { type: "delete"; task_id: string; revision: number; stream_id: string; sequence: number }
  | { type: "merge"; tasks: Task[] }
  | { type: "merge_one"; task: Task };

export function isTaskSocketMessage(value: unknown): value is Extract<
  TaskSocketMessage,
  { sequence: number }
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (
    typeof message.stream_id !== "string" ||
    typeof message.sequence !== "number" ||
    !Number.isSafeInteger(message.sequence) ||
    message.sequence < 1
  ) {
    return false;
  }
  if (message.type === "snapshot") {
    return Array.isArray(message.tasks);
  }
  if (message.type === "update") {
    return Boolean(message.task && typeof message.task === "object");
  }
  if (message.type === "delete") {
    return (
      typeof message.task_id === "string" &&
      typeof message.revision === "number" &&
      Number.isSafeInteger(message.revision) &&
      message.revision >= 0
    );
  }
  return false;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.created_at - a.created_at);
}

export type TaskStoreApi = {
  getSnapshot: () => Task[];
  getTask: (taskId: string | null | undefined) => Task | null;
  subscribe: (listener: () => void) => () => void;
};

type MutableTaskStore = TaskStoreApi & {
  setTasks: (updater: (previous: Task[]) => Task[]) => void;
};

function createTaskStore(): MutableTaskStore {
  let tasks: Task[] = [];
  let tasksById = new Map<string, Task>();
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => tasks,
    getTask: (taskId) => taskId ? tasksById.get(taskId) ?? null : null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTasks: (updater) => {
      const next = updater(tasks);
      if (Object.is(next, tasks)) return;
      tasks = next;
      tasksById = new Map(next.map((task) => [task.id, task]));
      listeners.forEach((listener) => listener());
    },
  };
}

export function useTaskStore() {
  const [store] = useState(createTaskStore);
  const tasks = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const setTasks = useCallback(
    (updater: (previous: Task[]) => Task[]) => store.setTasks(updater),
    [store],
  );
  const streamIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const tombstoneRevisionsRef = useRef(new Map<string, number>());

  const recordTombstone = useCallback((taskId: string, revision: number) => {
    const knownRevision = tombstoneRevisionsRef.current.get(taskId) ?? -1;
    if (revision > knownRevision) {
      tombstoneRevisionsRef.current.set(taskId, revision);
    }
  }, []);

  const acceptSocketMessage = useCallback((message: Extract<TaskSocketMessage, { sequence: number }>) => {
    if (streamIdRef.current !== message.stream_id) {
      streamIdRef.current = message.stream_id;
      sequenceRef.current = 0;
    }
    if (message.sequence <= sequenceRef.current) {
      return false;
    }
    sequenceRef.current = message.sequence;
    return true;
  }, []);

  const mergeTasks = useCallback((incoming: Task[], source: string) => {
    const normalized = incoming
      .map((task) => normalizeTaskForRenderer(task, source))
      .filter((task): task is Task => task !== null);
    setTasks((previous) => {
      const next = [...previous];
      const indexById = new Map(previous.map((task, index) => [task.id, index]));
      let changed = false;
      let added = false;
      normalized.forEach((task) => {
        const revision = task.revision ?? 0;
        const tombstoneRevision = tombstoneRevisionsRef.current.get(task.id) ?? -1;
        const existingIndex = indexById.get(task.id);
        const existing = existingIndex === undefined ? undefined : next[existingIndex];
        const existingRevision = existing?.revision ?? -1;
        if (revision > tombstoneRevision && revision >= existingRevision) {
          if (existingIndex === undefined) {
            indexById.set(task.id, next.length);
            next.push(task);
            added = true;
            changed = true;
          } else if (!Object.is(existing, task)) {
            next[existingIndex] = task;
            changed = true;
          }
        }
      });
      if (!changed) return previous;
      return added ? sortTasks(next) : next;
    });
  }, [setTasks]);

  const applyMessage = useCallback((message: TaskSocketMessage) => {
    if ("sequence" in message && !acceptSocketMessage(message)) {
      return;
    }

    if (message.type === "snapshot") {
      const normalized = message.tasks
        .map((task) => normalizeTaskForRenderer(task, "event:snapshot"))
        .filter((task): task is Task => task !== null)
        .filter((task) => (task.revision ?? 0) > (tombstoneRevisionsRef.current.get(task.id) ?? -1));
      setTasks(() => sortTasks(normalized));
      return;
    }

    if (message.type === "update" || message.type === "merge_one") {
      mergeTasks([message.task], message.type === "update" ? "event:update" : "http:task");
      return;
    }

    if (message.type === "merge") {
      mergeTasks(message.tasks, "http:history");
      return;
    }

    const knownRevision = tombstoneRevisionsRef.current.get(message.task_id) ?? -1;
    if (message.revision < knownRevision) {
      return;
    }
    tombstoneRevisionsRef.current.set(message.task_id, message.revision);
    setTasks((prev) => prev.filter((task) => task.id !== message.task_id));
  }, [acceptSocketMessage, mergeTasks, setTasks]);

  const addTask = useCallback((task: Task) => {
    const normalizedTask = normalizeTaskForRenderer(task, "local:add");
    if (!normalizedTask) {
      return;
    }
    mergeTasks([normalizedTask], "local:add");
  }, [mergeTasks]);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((prev) => {
      const task = prev.find((item) => item.id === taskId);
      recordTombstone(taskId, (task?.revision ?? 0) + 1);
      return prev.filter((item) => item.id !== taskId);
    });
  }, [recordTombstone, setTasks]);

  const clearTasks = useCallback((predicate?: (task: Task) => boolean) => {
    setTasks((prev) => {
      if (!predicate) {
        prev.forEach((task) => {
          recordTombstone(task.id, (task.revision ?? 0) + 1);
        });
        return [];
      }
      return prev.filter((task) => {
        if (!predicate(task)) {
          return true;
        }
        recordTombstone(task.id, (task.revision ?? 0) + 1);
        return false;
      });
    });
  }, [recordTombstone, setTasks]);

  return {
    tasks,
    store,
    applyMessage,
    addTask,
    deleteTask,
    clearTasks,
  };
}

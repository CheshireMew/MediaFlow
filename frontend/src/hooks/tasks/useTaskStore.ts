import { useCallback, useRef, useState } from "react";

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

export function useTaskStore() {
  const [tasks, setTasks] = useState<Task[]>([]);
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
      const byId = new Map(previous.map((task) => [task.id, task]));
      normalized.forEach((task) => {
        const revision = task.revision ?? 0;
        const tombstoneRevision = tombstoneRevisionsRef.current.get(task.id) ?? -1;
        const existingRevision = byId.get(task.id)?.revision ?? -1;
        if (revision > tombstoneRevision && revision >= existingRevision) {
          byId.set(task.id, task);
        }
      });
      return sortTasks([...byId.values()]);
    });
  }, []);

  const applyMessage = useCallback((message: TaskSocketMessage) => {
    if ("sequence" in message && !acceptSocketMessage(message)) {
      return;
    }

    if (message.type === "snapshot") {
      const normalized = message.tasks
        .map((task) => normalizeTaskForRenderer(task, "event:snapshot"))
        .filter((task): task is Task => task !== null)
        .filter((task) => (task.revision ?? 0) > (tombstoneRevisionsRef.current.get(task.id) ?? -1));
      setTasks(sortTasks(normalized));
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
  }, [acceptSocketMessage, mergeTasks]);

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
  }, [recordTombstone]);

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
  }, [recordTombstone]);

  return {
    tasks,
    applyMessage,
    addTask,
    deleteTask,
    clearTasks,
  };
}

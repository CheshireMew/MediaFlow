import type { Task } from "../../types/task";
import type { TaskSocketMessage } from "../../hooks/tasks/useTaskStore";

export type TaskSourceKind = "local" | "remote";

export type TaskSource = {
  id: "desktop" | "backend";
  kind: TaskSourceKind;
  ready: boolean;
  settled: boolean;
  clearPredicate: (task: Task) => boolean;
  loadSnapshot: () => Promise<Task[]>;
  supportsTask: (task: Task) => boolean;
  pauseTask: (taskId: string) => Promise<unknown> | void;
  pauseAll: (tasks: Task[]) => Promise<void>;
  resumeTask: (taskId: string) => Promise<unknown>;
  deleteTask: (task: Task, removeTask: (taskId: string) => void) => Promise<void>;
  clearTasks: (
    tasks: Task[],
    removeTask: (taskId: string) => void,
    clearTasks: (predicate?: (task: Task) => boolean) => void,
  ) => Promise<void>;
  subscribe?: (
    onMessage: (message: TaskSocketMessage) => void,
    onReady: () => void,
  ) => () => void;
  pollIntervalMs?: number;
  shouldPoll?: () => boolean;
};

export type AggregatedTaskSourceState = {
  connected: boolean;
  remoteTasksReady: boolean;
  tasksSettled: boolean;
};

export type TaskSourceBundle = {
  desktopSource: TaskSource;
  backendSource: TaskSource;
  taskSources: TaskSource[];
};

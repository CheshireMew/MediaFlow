import type { Task } from "../../src/types/task";

export type DesktopTaskStatus = "pending" | "running" | "completed" | "failed";
export type DesktopTaskType =
  | "download"
  | "transcribe"
  | "translate"
  | "synthesize"
  | "extract"
  | "enhance"
  | "clean";

export type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
};

export type PausedDesktopWorkerTask = {
  command: DesktopTaskType;
  payload: Record<string, unknown>;
};

export type DesktopTaskCollections = {
  activeTaskId: string | null;
  queuedTaskIds: string[];
  pausedTasks: Map<string, PausedDesktopWorkerTask>;
  requests: Map<string, DesktopWorkerRequest>;
};

export type DesktopTaskActionPlan =
  | { status: "ignored" }
  | {
      status: "paused" | "removed" | "cancelled" | "resumed";
      removeRequest?: boolean;
      removePaused?: boolean;
      removeQueued?: boolean;
      addPausedTask?: PausedDesktopWorkerTask;
      rejectMessage?: string;
      emitDelete?: boolean;
      emitTask?: Task;
      shouldRestartWorker?: boolean;
      resumeTask?: PausedDesktopWorkerTask;
    };

export type DesktopWorkerEventPayload = {
  progress?: number;
  message?: string;
};

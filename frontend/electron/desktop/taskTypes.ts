import type { Task } from "../../src/types/task";
import type { DesktopTaskCommand } from "../../src/contracts/generatedTaskCatalog";

export type DesktopTaskStatus = "pending" | "running" | "completed" | "failed";
export type DesktopTaskType = DesktopTaskCommand;

export type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
};

export type DesktopWorkerRuntimeRequest = DesktopWorkerRequest & {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type PausedDesktopWorkerTask = {
  command: DesktopTaskType;
  payload: Record<string, unknown>;
};

export type ActiveDesktopWorkerTask = {
  taskId: string;
  slotId: string;
  command: DesktopTaskType;
  payload: Record<string, unknown>;
  startedAt: number;
  progress: number;
  message?: string;
};

export type DesktopTaskCollections = {
  runningTaskIds: Set<string>;
  queuedTaskIds: string[];
  pausedTasks: Map<string, PausedDesktopWorkerTask>;
  requests: ReadonlyMap<string, DesktopWorkerRequest>;
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
      shouldRestartAssignedSlot?: boolean;
      resumeTask?: PausedDesktopWorkerTask;
    };

export type DesktopWorkerEventPayload = {
  progress?: number;
  message?: string;
};

import {
  createDesktopTask,
  isTrackedDesktopCommand,
} from "./taskMapper";
import type {
  DesktopTaskActionPlan,
  DesktopTaskCollections,
  PausedDesktopWorkerTask,
} from "./taskTypes";

export function planPauseDesktopTask(
  taskId: string,
  collections: DesktopTaskCollections,
): DesktopTaskActionPlan {
  const pending = collections.requests.get(taskId);
  if (!pending || !isTrackedDesktopCommand(pending.command)) {
    return { status: "ignored" };
  }

  return {
    status: "paused",
    removeRequest: true,
    removeQueued: true,
    addPausedTask: {
      command: pending.command,
      payload: {
        ...pending.payload,
        task_id: taskId,
      },
    },
    rejectMessage: "Desktop worker task paused",
    emitTask: {
      ...createDesktopTask({
        id: taskId,
        command: pending.command,
        payload: pending.payload,
        status: "failed",
        progress: 0,
        message: "Paused",
      }),
      status: "paused",
      queue_state: "paused",
      message: "Paused",
    },
    shouldRestartWorker: collections.activeTaskId === taskId,
  };
}

export function planResumeDesktopTask(
  taskId: string,
  pausedTasks: Map<string, PausedDesktopWorkerTask>,
): DesktopTaskActionPlan {
  const pausedTask = pausedTasks.get(taskId);
  if (!pausedTask) {
    return { status: "ignored" };
  }

  return {
    status: "resumed",
    removePaused: true,
    resumeTask: pausedTask,
  };
}

export function planCancelDesktopTask(
  taskId: string,
  collections: DesktopTaskCollections,
): DesktopTaskActionPlan {
  if (collections.pausedTasks.has(taskId)) {
    return {
      status: "removed",
      removePaused: true,
      emitDelete: true,
    };
  }

  const pending = collections.requests.get(taskId);
  if (!pending || !isTrackedDesktopCommand(pending.command)) {
    return { status: "ignored" };
  }

  if (collections.queuedTaskIds.includes(taskId)) {
    return {
      status: "removed",
      removeRequest: true,
      removeQueued: true,
      emitDelete: true,
      rejectMessage: "Desktop worker task removed",
    };
  }

  if (collections.activeTaskId === taskId) {
    return {
      status: "cancelled",
      removeRequest: true,
      rejectMessage: "Desktop worker task cancelled",
      shouldRestartWorker: true,
      emitTask: {
        ...createDesktopTask({
          id: taskId,
          command: pending.command,
          payload: pending.payload,
          status: "failed",
          progress: 0,
          message: "Cancelled",
          error: "Cancelled by user",
        }),
        status: "cancelled",
        queue_state: "cancelled",
      },
    };
  }

  return {
    status: "removed",
    removeRequest: true,
    emitDelete: true,
    rejectMessage: "Desktop worker task removed",
  };
}

import type { Task } from "../../src/types/task";
import { createDesktopTask, getDesktopTaskSnapshot } from "./taskMapper";
import type {
  ActiveDesktopWorkerTask,
  DesktopTaskCollections,
  DesktopTaskType,
  DesktopWorkerRuntimeRequest,
  PausedDesktopWorkerTask,
} from "./taskTypes";
import { isDesktopTaskCommand } from "./workerCommandLanes";

type EmitTask = (message: unknown) => void;

export class DesktopWorkerTaskQueue {
  readonly activeTasks = new Map<string, ActiveDesktopWorkerTask>();
  readonly queuedTaskIds: string[] = [];
  readonly pausedTasks = new Map<string, PausedDesktopWorkerTask>();

  listTasks(requests: Map<string, DesktopWorkerRuntimeRequest>, historyTasks: Task[] = []) {
    return getDesktopTaskSnapshot({
      runningTaskIds: this.runningTaskIds(),
      activeTasks: this.activeTasks,
      queuedTaskIds: this.queuedTaskIds,
      pausedTasks: this.pausedTasks,
      requests,
      historyTasks,
    });
  }

  collections(requests: Map<string, DesktopWorkerRuntimeRequest>): DesktopTaskCollections {
    return {
      runningTaskIds: this.runningTaskIds(),
      queuedTaskIds: this.queuedTaskIds,
      pausedTasks: this.pausedTasks,
      requests,
    };
  }

  enqueue(taskId: string, command: DesktopTaskType, payload: Record<string, unknown>, emitTask: EmitTask) {
    this.queuedTaskIds.push(taskId);
    emitTask({
      type: "update",
      task: {
        ...createDesktopTask({
          id: taskId,
          command,
          payload,
          status: "pending",
          progress: 0,
          message: "Queued",
        }),
        queue_position: this.queuedTaskIds.length,
      },
    });
  }

  removeQueuedTask(taskId: string, requests: Map<string, DesktopWorkerRuntimeRequest>, emitTask: EmitTask) {
    const index = this.queuedTaskIds.indexOf(taskId);
    if (index === -1) {
      return false;
    }
    this.queuedTaskIds.splice(index, 1);
    this.syncQueuedTasks(requests, emitTask);
    return true;
  }

  syncQueuedTasks(requests: Map<string, DesktopWorkerRuntimeRequest>, emitTask: EmitTask) {
    this.queuedTaskIds.forEach((taskId, index) => {
      const pending = requests.get(taskId);
      if (!pending || !isDesktopTaskCommand(pending.command)) {
        return;
      }
      emitTask({
        type: "update",
        task: {
          ...createDesktopTask({
            id: taskId,
            command: pending.command,
            payload: pending.payload,
            status: "pending",
            progress: 0,
            message: "Queued",
          }),
          queue_position: index + 1,
        },
      });
    });
  }

  nextTask(requests: Map<string, DesktopWorkerRuntimeRequest>) {
    const nextTaskId = this.queuedTaskIds.shift();
    if (!nextTaskId) {
      return null;
    }
    const pending = requests.get(nextTaskId);
    if (!pending) {
      return { taskId: nextTaskId, request: null };
    }
    return { taskId: nextTaskId, request: pending };
  }

  markActiveStarted(
    taskId: string,
    request: DesktopWorkerRuntimeRequest,
    slotId: string,
    emitTask: EmitTask,
  ) {
    if (!isDesktopTaskCommand(request.command)) {
      return;
    }
    this.activeTasks.set(taskId, {
      taskId,
      slotId,
      command: request.command,
      payload: request.payload,
      startedAt: Date.now(),
      progress: 0,
      message: "Starting",
    });
    emitTask({
      type: "update",
      task: {
        ...createDesktopTask({
          id: taskId,
          command: request.command,
          payload: request.payload,
          status: "running",
          progress: 0,
          message: "Starting",
        }),
        queue_position: null,
      },
    });
  }

  clearActiveIf(taskId: string) {
    return this.activeTasks.delete(taskId);
  }

  updateActiveProgress(taskId: string, progress: number, message?: string) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return false;
    }

    activeTask.progress = Number.isFinite(progress) ? progress : activeTask.progress;
    activeTask.message = message ?? activeTask.message;
    return true;
  }

  runningTaskIds() {
    return new Set(this.activeTasks.keys());
  }

  clearQueued() {
    this.queuedTaskIds.length = 0;
  }
}

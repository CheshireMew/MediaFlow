import type { Task } from "../../src/types/task";
import { createDesktopTask, getDesktopTaskSnapshot, isTrackedDesktopCommand } from "./taskMapper";
import type {
  DesktopTaskCollections,
  DesktopTaskType,
  DesktopWorkerRuntimeRequest,
  PausedDesktopWorkerTask,
} from "./taskTypes";

type EmitTask = (message: unknown) => void;

export class DesktopWorkerTaskQueue {
  activeTaskId: string | null = null;
  readonly queuedTaskIds: string[] = [];
  readonly pausedTasks = new Map<string, PausedDesktopWorkerTask>();

  listTasks(requests: Map<string, DesktopWorkerRuntimeRequest>, historyTasks: Task[] = []) {
    return getDesktopTaskSnapshot({
      activeTaskId: this.activeTaskId,
      queuedTaskIds: this.queuedTaskIds,
      pausedTasks: this.pausedTasks,
      requests,
      historyTasks,
    });
  }

  collections(requests: Map<string, DesktopWorkerRuntimeRequest>): DesktopTaskCollections {
    return {
      activeTaskId: this.activeTaskId,
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
      if (!pending || !isTrackedDesktopCommand(pending.command)) {
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
    this.activeTaskId = nextTaskId;
    return { taskId: nextTaskId, request: pending };
  }

  markActiveStarted(taskId: string, request: DesktopWorkerRuntimeRequest, emitTask: EmitTask) {
    if (!isTrackedDesktopCommand(request.command)) {
      return;
    }
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
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
      return true;
    }
    return false;
  }

  resetActive() {
    this.activeTaskId = null;
  }

  clearQueued() {
    this.queuedTaskIds.length = 0;
  }
}

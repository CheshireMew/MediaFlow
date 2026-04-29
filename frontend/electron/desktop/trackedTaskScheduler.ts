import type { Task } from "../../src/types/task";
import {
  createDesktopTaskProgressUpdate,
  createDesktopTaskResponseUpdate,
} from "./taskMapper";
import type { DesktopTaskHistoryStore } from "./historyStore";
import type {
  DesktopTaskType,
  DesktopWorkerRuntimeRequest,
  PausedDesktopWorkerTask,
} from "./taskTypes";
import { DesktopWorkerTaskQueue } from "./workerTaskQueue";
import { isDesktopTaskCommand } from "./workerCommandLanes";
import {
  DesktopWorkerSlot,
  type DesktopWorkerSlotStopMode,
} from "./workerSlot";
import type { DesktopWorkerProtocolResponse } from "./workerProtocol";

type TrackedTaskSchedulerArgs = {
  requests: Map<string, DesktopWorkerRuntimeRequest>;
  historyStore: DesktopTaskHistoryStore;
  createSlot: (slotId: string) => DesktopWorkerSlot;
  emitTask: (message: unknown) => void;
  maxConcurrentTasks: number;
};

export class DesktopWorkerTrackedTaskScheduler {
  readonly pausedTasks: Map<string, PausedDesktopWorkerTask>;

  private readonly taskQueue = new DesktopWorkerTaskQueue();
  private readonly trackedSlots = new Map<string, DesktopWorkerSlot>();
  private readonly taskAssignments = new Map<string, string>();
  private readonly requests: Map<string, DesktopWorkerRuntimeRequest>;
  private readonly historyStore: DesktopTaskHistoryStore;
  private readonly createSlot: (slotId: string) => DesktopWorkerSlot;
  private readonly emitTask: (message: unknown) => void;
  private readonly maxConcurrentTasks: number;

  constructor(args: TrackedTaskSchedulerArgs) {
    this.requests = args.requests;
    this.historyStore = args.historyStore;
    this.createSlot = args.createSlot;
    this.emitTask = args.emitTask;
    this.maxConcurrentTasks = args.maxConcurrentTasks;
    this.pausedTasks = this.taskQueue.pausedTasks;
  }

  listTasks(historyTasks: Task[] = []) {
    return this.taskQueue.listTasks(this.requests, historyTasks);
  }

  collections() {
    return this.taskQueue.collections(this.requests);
  }

  ensureSlots() {
    let allStarted = true;
    for (let index = 1; index <= this.maxConcurrentTasks; index += 1) {
      const slotId = `task-${index}`;
      let slot = this.trackedSlots.get(slotId);
      if (!slot) {
        slot = this.createSlot(slotId);
        this.trackedSlots.set(slotId, slot);
      }
      allStarted = slot.start() && allStarted;
    }
    return allStarted;
  }

  enqueue(taskId: string, command: DesktopTaskType, payload: Record<string, unknown>) {
    this.taskQueue.enqueue(taskId, command, payload, this.emitTask);
    this.dispatchQueuedTasks();
  }

  removeQueuedTask(taskId: string) {
    return this.taskQueue.removeQueuedTask(taskId, this.requests, this.emitTask);
  }

  addPausedTask(taskId: string, task: PausedDesktopWorkerTask) {
    this.taskQueue.pausedTasks.set(taskId, task);
  }

  removePausedTask(taskId: string) {
    this.taskQueue.pausedTasks.delete(taskId);
  }

  emitTaskUpdate(task: Task) {
    this.emitTask({ type: "update", task });
  }

  emitTaskDelete(taskId: string) {
    this.emitTask({ type: "delete", task_id: taskId });
  }

  emitFailure(
    taskId: string,
    command: DesktopTaskType,
    payload: Record<string, unknown>,
    error: string,
  ) {
    const taskUpdate = createDesktopTaskResponseUpdate({
      taskId,
      request: {
        command,
        payload,
      },
      ok: false,
      error,
    });

    if (!taskUpdate) {
      return;
    }

    this.historyStore.upsert(taskUpdate);
    this.emitTask({
      type: "update",
      task: taskUpdate,
    });
  }

  restartAssignedSlot(taskId: string) {
    const slotId = this.taskAssignments.get(taskId);
    if (!slotId) {
      return;
    }

    const slot = this.trackedSlots.get(slotId);
    this.taskAssignments.delete(taskId);
    this.taskQueue.clearActiveIf(taskId);
    slot?.clearActiveRequest(taskId);
    slot?.stop("restart");
  }

  dispatchQueuedTasks() {
    for (const slot of this.trackedSlots.values()) {
      if (!slot.isReadyIdle) {
        continue;
      }

      const next = this.taskQueue.nextTask(this.requests);
      if (!next) {
        return;
      }
      if (!next.request) {
        this.taskQueue.syncQueuedTasks(this.requests, this.emitTask);
        continue;
      }
      if (!isDesktopTaskCommand(next.request.command)) {
        this.requests.delete(next.taskId);
        next.request.reject(new Error("Desktop task queue received a non-task command"));
        continue;
      }

      this.taskAssignments.set(next.taskId, slot.id);
      this.taskQueue.markActiveStarted(next.taskId, next.request, slot.id, this.emitTask);
      this.taskQueue.syncQueuedTasks(this.requests, this.emitTask);

      try {
        slot.send({
          id: next.taskId,
          command: next.request.command,
          payload: next.request.payload,
        });
      } catch (error) {
        this.requests.delete(next.taskId);
        this.taskAssignments.delete(next.taskId);
        this.taskQueue.clearActiveIf(next.taskId);
        const errorMessage = error instanceof Error ? error.message : "Desktop worker request failed";
        this.emitFailure(next.taskId, next.request.command, next.request.payload, errorMessage);
        next.request.reject(error);
        slot.stop("restart");
      }
    }
  }

  handleSlotReady(slotId: string) {
    if (!this.trackedSlots.has(slotId)) {
      return false;
    }
    this.dispatchQueuedTasks();
    return true;
  }

  handleTaskEvent(slotId: string, taskId: string, payload: unknown) {
    if (this.taskAssignments.get(taskId) !== slotId) {
      return;
    }

    const pending = this.requests.get(taskId);
    if (
      !pending ||
      !isDesktopTaskCommand(pending.command) ||
      !payload ||
      typeof payload !== "object"
    ) {
      return;
    }

    const taskUpdate = createDesktopTaskProgressUpdate({
      taskId,
      request: pending,
      payload,
    });
    if (taskUpdate) {
      this.taskQueue.updateActiveProgress(taskId, taskUpdate.progress, taskUpdate.message);
      this.emitTask({
        type: "update",
        task: taskUpdate,
      });
    }
  }

  handleResponse(
    slotId: string,
    message: DesktopWorkerProtocolResponse,
    pending: DesktopWorkerRuntimeRequest,
  ) {
    if (this.taskAssignments.get(message.id) !== slotId) {
      return false;
    }

    this.requests.delete(message.id);
    this.taskAssignments.delete(message.id);
    this.taskQueue.clearActiveIf(message.id);
    this.trackedSlots.get(slotId)?.completeActiveRequest(message.id);

    const taskUpdate = createDesktopTaskResponseUpdate({
      taskId: message.id,
      request: pending,
      ok: Boolean(message.ok),
      result: message.result,
      error: message.error,
    });
    if (taskUpdate) {
      this.historyStore.upsert(taskUpdate);
      this.emitTask({
        type: "update",
        task: taskUpdate,
      });
    }

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Desktop worker request failed"));
    }

    this.dispatchQueuedTasks();
    return true;
  }

  handleSlotExit(
    slotId: string,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    if (!this.trackedSlots.has(slotId)) {
      return false;
    }

    if (activeRequestId && this.taskAssignments.get(activeRequestId) === slotId) {
      const pending = this.requests.get(activeRequestId);
      this.requests.delete(activeRequestId);
      this.taskAssignments.delete(activeRequestId);
      this.taskQueue.clearActiveIf(activeRequestId);

      if (pending && isDesktopTaskCommand(pending.command)) {
        this.emitFailure(
          activeRequestId,
          pending.command,
          pending.payload,
          stopMode === "restart" ? "Desktop worker restarted" : "Desktop worker exited",
        );
        pending.reject(new Error("Desktop worker exited"));
      }
    }

    if (stopMode !== "shutdown") {
      this.trackedSlots.get(slotId)?.start();
    }
    return true;
  }

  stopAll() {
    for (const slot of this.trackedSlots.values()) {
      slot.stop("shutdown");
    }
  }

  failAll(message: string) {
    this.taskQueue.clearQueued();
    for (const [taskId, pending] of [...this.requests.entries()]) {
      if (!isDesktopTaskCommand(pending.command)) {
        continue;
      }
      this.emitFailure(taskId, pending.command, pending.payload, message);
      pending.reject(new Error(message));
      this.requests.delete(taskId);
      this.taskAssignments.delete(taskId);
      this.taskQueue.clearActiveIf(taskId);
    }
  }
}


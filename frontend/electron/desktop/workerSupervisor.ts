import {
  planCancelDesktopTask,
  planPauseDesktopTask,
  planResumeDesktopTask,
} from "./taskPlans";
import type { DesktopTaskType, DesktopWorkerRuntimeRequest } from "./taskTypes";
import { DesktopTaskHistoryStore } from "./historyStore";
import { startDesktopWorkerProcess, type DesktopWorkerProcessFactory } from "./workerProcess";
import type { DesktopWorkerProtocolResponse } from "./workerProtocol";
import { DesktopWorkerChannels } from "./workerChannels";
import {
  getDesktopWorkerExecutionLane,
  isDesktopTaskCommand,
} from "./workerCommandLanes";
import {
  DesktopWorkerSlot,
  type DesktopWorkerSlotStopMode,
} from "./workerSlot";
import {
  DesktopWorkerSerialLanes,
  type SerialWorkerLane,
} from "./workerSerialLanes";
import { DesktopWorkerTrackedTaskScheduler } from "./trackedTaskScheduler";

function resolveDesktopMaxConcurrency() {
  const raw = Number(process.env.MEDIAFLOW_DESKTOP_TASK_MAX_CONCURRENT ?? 2);
  if (!Number.isFinite(raw)) {
    return 2;
  }
  return Math.max(1, Math.min(4, Math.floor(raw)));
}

export class DesktopWorkerSupervisor {
  private requestSequence = 0;
  private readonly desktopWorkerRequests = new Map<string, DesktopWorkerRuntimeRequest>();
  private readonly channels = new DesktopWorkerChannels();
  private readonly maxConcurrentTrackedTasks = resolveDesktopMaxConcurrency();
  private readonly historyStore: DesktopTaskHistoryStore;
  private readonly processFactory: DesktopWorkerProcessFactory;
  private readonly serialLanes: DesktopWorkerSerialLanes;
  private readonly trackedTasks: DesktopWorkerTrackedTaskScheduler;

  constructor(
    historyStore: DesktopTaskHistoryStore,
    processFactory: DesktopWorkerProcessFactory = startDesktopWorkerProcess,
  ) {
    this.historyStore = historyStore;
    this.processFactory = processFactory;
    this.serialLanes = new DesktopWorkerSerialLanes({
      requests: this.desktopWorkerRequests,
      createSlot: (slotId) => this.createSlot(slotId),
    });
    this.trackedTasks = new DesktopWorkerTrackedTaskScheduler({
      requests: this.desktopWorkerRequests,
      historyStore: this.historyStore,
      createSlot: (slotId) => this.createSlot(slotId),
      emitTask: (message) => this.emitDesktopTaskMessage(message),
      maxConcurrentTasks: this.maxConcurrentTrackedTasks,
    });
  }

  stop() {
    this.serialLanes.stopAll("Desktop worker exited");
    this.trackedTasks.stopAll();
    this.trackedTasks.failAll("Desktop worker exited");
  }

  prewarm() {
    this.serialLanes.prewarmControlLane();
    this.trackedTasks.ensureSlots();
  }

  listTasks() {
    this.historyStore.ensureLoaded();
    return this.trackedTasks.listTasks(this.historyStore.list());
  }

  request<T = unknown>(command: string, payload?: Record<string, unknown>) {
    let lane: ReturnType<typeof getDesktopWorkerExecutionLane>;
    try {
      lane = getDesktopWorkerExecutionLane(command);
    } catch (error) {
      return Promise.reject(error);
    }

    const normalizedPayload = payload ?? {};
    const requestedTaskId =
      typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.trim().length > 0
        ? normalizedPayload.task_id
        : `worker-${Date.now()}-${++this.requestSequence}`;
    const id = requestedTaskId;
    const trackedPayload = this.resolveTrackedPayload(id, normalizedPayload);

    return new Promise<T>((resolve, reject) => {
      this.historyStore.remove(id);
      this.desktopWorkerRequests.set(id, {
        command,
        payload: trackedPayload,
        resolve: (value) => resolve(value as T),
        reject,
      });

      if (lane === "task") {
        if (!this.trackedTasks.ensureSlots()) {
          this.desktopWorkerRequests.delete(id);
          this.trackedTasks.emitFailure(
            id,
            command as DesktopTaskType,
            trackedPayload,
            "Desktop worker process could not be started",
          );
          reject(new Error("Desktop worker process could not be started"));
          return;
        }

        this.trackedTasks.enqueue(id, command as DesktopTaskType, trackedPayload);
        return;
      }

      if (!this.serialLanes.enqueue(lane as SerialWorkerLane, id)) {
        this.desktopWorkerRequests.delete(id);
        reject(new Error("Desktop worker process could not be started"));
      }
    });
  }

  submitTask(command: string, payload?: Record<string, unknown>) {
    const lane = getDesktopWorkerExecutionLane(command);
    if (lane !== "task" || !isDesktopTaskCommand(command)) {
      throw new Error(`Desktop command "${command}" is not a task submission command`);
    }

    const normalizedPayload = payload ?? {};
    const requestedTaskId =
      typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.trim().length > 0
        ? normalizedPayload.task_id
        : `worker-${Date.now()}-${++this.requestSequence}`;
    const id = requestedTaskId;
    const trackedPayload = this.resolveTrackedPayload(id, normalizedPayload);

    this.historyStore.remove(id);
    this.desktopWorkerRequests.set(id, {
      command,
      payload: trackedPayload,
      resolve: () => undefined,
      reject: () => undefined,
    });

    if (!this.trackedTasks.ensureSlots()) {
      this.desktopWorkerRequests.delete(id);
      this.trackedTasks.emitFailure(
        id,
        command,
        trackedPayload,
        "Desktop worker process could not be started",
      );
      throw new Error("Desktop worker process could not be started");
    }

    this.trackedTasks.enqueue(id, command, trackedPayload);

    return {
      task_id: id,
      status: "pending" as const,
      message: "Queued",
    };
  }

  async pauseTask(taskId: string) {
    const plan = planPauseDesktopTask(taskId, this.trackedTasks.collections());
    if (plan.status === "ignored") {
      return { status: "ignored" };
    }

    const pending = this.desktopWorkerRequests.get(taskId);
    if (!pending) {
      return { status: "ignored" };
    }

    if (plan.removeRequest) {
      this.desktopWorkerRequests.delete(taskId);
    }
    if (plan.removeQueued) {
      this.trackedTasks.removeQueuedTask(taskId);
    }
    if (plan.addPausedTask) {
      this.trackedTasks.addPausedTask(taskId, plan.addPausedTask);
    }
    if (plan.emitTask) {
      this.trackedTasks.emitTaskUpdate(plan.emitTask);
    }
    if (plan.rejectMessage) {
      pending.reject(new Error(plan.rejectMessage));
    }
    if (plan.shouldRestartAssignedSlot) {
      this.trackedTasks.restartAssignedSlot(taskId);
    }

    this.trackedTasks.dispatchQueuedTasks();
    return { status: plan.status };
  }

  async resumeTask(taskId: string) {
    const plan = planResumeDesktopTask(taskId, this.trackedTasks.pausedTasks);
    if (plan.status === "ignored" || !plan.resumeTask) {
      return { status: "ignored" };
    }

    if (plan.removePaused) {
      this.trackedTasks.removePausedTask(taskId);
    }
    this.submitTask(plan.resumeTask.command, plan.resumeTask.payload);
    return { status: plan.status };
  }

  async cancelTask(taskId: string) {
    if (this.historyStore.remove(taskId)) {
      this.trackedTasks.emitTaskDelete(taskId);
      return { status: "removed" };
    }

    const plan = planCancelDesktopTask(taskId, this.trackedTasks.collections());
    if (plan.status === "ignored") {
      return { status: "ignored" };
    }

    const pending = this.desktopWorkerRequests.get(taskId);

    if (plan.removePaused) {
      this.trackedTasks.removePausedTask(taskId);
    }
    if (plan.removeRequest) {
      this.desktopWorkerRequests.delete(taskId);
    }
    if (plan.removeQueued) {
      this.trackedTasks.removeQueuedTask(taskId);
    }
    if (plan.emitDelete) {
      this.trackedTasks.emitTaskDelete(taskId);
    }
    if (plan.emitTask) {
      this.trackedTasks.emitTaskUpdate(plan.emitTask);
    }
    if (pending && plan.rejectMessage) {
      pending.reject(new Error(plan.rejectMessage));
    }
    if (plan.shouldRestartAssignedSlot) {
      this.trackedTasks.restartAssignedSlot(taskId);
    }

    this.trackedTasks.dispatchQueuedTasks();
    return { status: plan.status };
  }

  private emitDesktopTaskMessage(message: unknown) {
    this.channels.emitTask(message);
  }

  private resolveTrackedPayload(
    taskId: string,
    payload: Record<string, unknown>,
  ) {
    const existingCreatedAt = this.historyStore.get(taskId)?.created_at;
    const createdAt =
      typeof payload.created_at === "number" && Number.isFinite(payload.created_at)
        ? payload.created_at
        : existingCreatedAt ?? Date.now();

    return {
      ...payload,
      task_id: taskId,
      created_at: createdAt,
    };
  }

  private createSlot(slotId: string) {
    return new DesktopWorkerSlot(
      slotId,
      {
        onReady: (readySlotId) => this.handleSlotReady(readySlotId),
        onEvent: (_readySlotId, event, payload, requestId) => {
          if (!this.channels.emitWorkerEvent(event, payload, requestId)) {
            console.log("[DesktopWorker event]", event, payload);
          }
        },
        onTaskEvent: (readySlotId, taskId, payload) =>
          this.trackedTasks.handleTaskEvent(readySlotId, taskId, payload),
        onResponse: (readySlotId, response) => this.handleDesktopWorkerResponse(readySlotId, response),
        onExit: (readySlotId, code, activeRequestId, stopMode) =>
          this.handleSlotExit(readySlotId, code, activeRequestId, stopMode),
        onLog: (readySlotId, line) => {
          console.log(`[DesktopWorker:${readySlotId}] ${line}`);
        },
        onParseError: (readySlotId, rawLine, error) => {
          console.error(`[DesktopWorker:${readySlotId}] Failed to parse line`, rawLine, error);
        },
      },
      this.processFactory,
    );
  }

  private handleSlotReady(slotId: string) {
    console.log(`[DesktopWorker:${slotId}] ready`);
    if (this.serialLanes.handleSlotReady(slotId)) {
      return;
    }
    this.trackedTasks.handleSlotReady(slotId);
  }

  private handleDesktopWorkerResponse(slotId: string, message: DesktopWorkerProtocolResponse) {
    const pending = this.desktopWorkerRequests.get(message.id);
    if (!pending) {
      return;
    }

    const lane = getDesktopWorkerExecutionLane(pending.command);
    if (lane === "task") {
      this.trackedTasks.handleResponse(slotId, message, pending);
      return;
    }

    this.serialLanes.handleResponse(slotId, lane as SerialWorkerLane, message, pending);
  }

  private handleSlotExit(
    slotId: string,
    code: number | null,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    console.log(`[DesktopWorker:${slotId}] exited with code ${code}`);
    if (this.serialLanes.handleSlotExit(slotId, activeRequestId, stopMode)) {
      return;
    }

    this.trackedTasks.handleSlotExit(slotId, activeRequestId, stopMode);
  }
}


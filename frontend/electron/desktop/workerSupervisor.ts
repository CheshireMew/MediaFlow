import {
  createDesktopTaskProgressUpdate,
  createDesktopTaskResponseUpdate,
} from "./taskMapper";
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
import { DesktopWorkerTaskQueue } from "./workerTaskQueue";
import {
  getDesktopWorkerExecutionLane,
  isDesktopTaskCommand,
  type DesktopWorkerExecutionLane,
} from "./workerCommandLanes";
import {
  DesktopWorkerSlot,
  type DesktopWorkerSlotStopMode,
} from "./workerSlot";

type SerialWorkerLane = Exclude<DesktopWorkerExecutionLane, "task">;

type SerialWorkerLaneState = {
  slot: DesktopWorkerSlot;
  queuedRequestIds: string[];
  activeRequestId: string | null;
};

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
  private readonly taskQueue = new DesktopWorkerTaskQueue();
  private readonly taskAssignments = new Map<string, string>();
  private readonly trackedSlots = new Map<string, DesktopWorkerSlot>();
  private readonly serialLanes = new Map<SerialWorkerLane, SerialWorkerLaneState>();
  private readonly maxConcurrentTrackedTasks = resolveDesktopMaxConcurrency();
  private readonly historyStore: DesktopTaskHistoryStore;
  private readonly processFactory: DesktopWorkerProcessFactory;

  constructor(
    historyStore: DesktopTaskHistoryStore,
    processFactory: DesktopWorkerProcessFactory = startDesktopWorkerProcess,
  ) {
    this.historyStore = historyStore;
    this.processFactory = processFactory;
  }

  stop() {
    for (const laneState of this.serialLanes.values()) {
      laneState.slot.stop("shutdown");
      this.failSerialLane(laneState, "Desktop worker exited");
    }
    for (const slot of this.trackedSlots.values()) {
      slot.stop("shutdown");
    }
    this.failAllTrackedRequests("Desktop worker exited");
  }

  prewarm() {
    this.ensureSerialLane("control").slot.start();
    this.ensureTrackedSlots();
  }

  listTasks() {
    this.historyStore.ensureLoaded();
    return this.taskQueue.listTasks(this.desktopWorkerRequests, this.historyStore.list());
  }

  request<T = unknown>(command: string, payload?: Record<string, unknown>) {
    let lane: DesktopWorkerExecutionLane;
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
        if (!this.ensureTrackedSlots()) {
          this.desktopWorkerRequests.delete(id);
          this.emitTrackedTaskFailure(
            id,
            command as DesktopTaskType,
            trackedPayload,
            "Desktop worker process could not be started",
          );
          reject(new Error("Desktop worker process could not be started"));
          return;
        }

        this.taskQueue.enqueue(id, command as DesktopTaskType, trackedPayload, (message) =>
          this.emitDesktopTaskMessage(message),
        );
        this.dispatchQueuedTrackedTasks();
        return;
      }

      const laneState = this.ensureSerialLane(lane);
      if (!laneState.slot.start()) {
        this.desktopWorkerRequests.delete(id);
        reject(new Error("Desktop worker process could not be started"));
        return;
      }

      laneState.queuedRequestIds.push(id);
      this.dispatchSerialLane(lane);
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

    if (!this.ensureTrackedSlots()) {
      this.desktopWorkerRequests.delete(id);
      this.emitTrackedTaskFailure(
        id,
        command,
        trackedPayload,
        "Desktop worker process could not be started",
      );
      throw new Error("Desktop worker process could not be started");
    }

    this.taskQueue.enqueue(id, command, trackedPayload, (message) =>
      this.emitDesktopTaskMessage(message),
    );
    this.dispatchQueuedTrackedTasks();

    return {
      task_id: id,
      status: "pending" as const,
      message: "Queued",
    };
  }

  async pauseTask(taskId: string) {
    const plan = planPauseDesktopTask(taskId, this.taskQueue.collections(this.desktopWorkerRequests));
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
      this.taskQueue.removeQueuedTask(taskId, this.desktopWorkerRequests, (message) =>
        this.emitDesktopTaskMessage(message),
      );
    }
    if (plan.addPausedTask) {
      this.taskQueue.pausedTasks.set(taskId, plan.addPausedTask);
    }
    if (plan.emitTask) {
      this.emitDesktopTaskMessage({ type: "update", task: plan.emitTask });
    }
    if (plan.rejectMessage) {
      pending.reject(new Error(plan.rejectMessage));
    }
    if (plan.shouldRestartAssignedSlot) {
      this.restartAssignedTaskSlot(taskId);
    }

    this.dispatchQueuedTrackedTasks();
    return { status: plan.status };
  }

  async resumeTask(taskId: string) {
    const plan = planResumeDesktopTask(taskId, this.taskQueue.pausedTasks);
    if (plan.status === "ignored" || !plan.resumeTask) {
      return { status: "ignored" };
    }

    if (plan.removePaused) {
      this.taskQueue.pausedTasks.delete(taskId);
    }
    this.submitTask(plan.resumeTask.command, plan.resumeTask.payload);
    return { status: plan.status };
  }

  async cancelTask(taskId: string) {
    if (this.historyStore.remove(taskId)) {
      this.emitDesktopTaskMessage({ type: "delete", task_id: taskId });
      return { status: "removed" };
    }

    const plan = planCancelDesktopTask(taskId, this.taskQueue.collections(this.desktopWorkerRequests));
    if (plan.status === "ignored") {
      return { status: "ignored" };
    }

    const pending = this.desktopWorkerRequests.get(taskId);

    if (plan.removePaused) {
      this.taskQueue.pausedTasks.delete(taskId);
    }
    if (plan.removeRequest) {
      this.desktopWorkerRequests.delete(taskId);
    }
    if (plan.removeQueued) {
      this.taskQueue.removeQueuedTask(taskId, this.desktopWorkerRequests, (message) =>
        this.emitDesktopTaskMessage(message),
      );
    }
    if (plan.emitDelete) {
      this.emitDesktopTaskMessage({ type: "delete", task_id: taskId });
    }
    if (plan.emitTask) {
      this.emitDesktopTaskMessage({ type: "update", task: plan.emitTask });
    }
    if (pending && plan.rejectMessage) {
      pending.reject(new Error(plan.rejectMessage));
    }
    if (plan.shouldRestartAssignedSlot) {
      this.restartAssignedTaskSlot(taskId);
    }

    this.dispatchQueuedTrackedTasks();
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

  private emitTrackedTaskFailure(
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
    this.emitDesktopTaskMessage({
      type: "update",
      task: taskUpdate,
    });
  }

  private ensureTrackedSlots() {
    let allStarted = true;
    for (let index = 1; index <= this.maxConcurrentTrackedTasks; index += 1) {
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

  private ensureSerialLane(lane: SerialWorkerLane) {
    const existing = this.serialLanes.get(lane);
    if (existing) {
      return existing;
    }

    const laneState: SerialWorkerLaneState = {
      slot: this.createSlot(lane),
      queuedRequestIds: [],
      activeRequestId: null,
    };
    this.serialLanes.set(lane, laneState);
    return laneState;
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
          this.handleDesktopWorkerTaskEvent(readySlotId, taskId, payload),
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
    const lane = this.serialLaneForSlot(slotId);
    if (lane) {
      this.dispatchSerialLane(lane);
      return;
    }
    this.dispatchQueuedTrackedTasks();
  }

  private dispatchQueuedTrackedTasks() {
    for (const slot of this.trackedSlots.values()) {
      if (!slot.isReadyIdle) {
        continue;
      }

      const next = this.taskQueue.nextTask(this.desktopWorkerRequests);
      if (!next) {
        return;
      }
      if (!next.request) {
        this.taskQueue.syncQueuedTasks(this.desktopWorkerRequests, (message) =>
          this.emitDesktopTaskMessage(message),
        );
        continue;
      }
      if (!isDesktopTaskCommand(next.request.command)) {
        this.desktopWorkerRequests.delete(next.taskId);
        next.request.reject(new Error("Desktop task queue received a non-task command"));
        continue;
      }

      this.taskAssignments.set(next.taskId, slot.id);
      this.taskQueue.markActiveStarted(next.taskId, next.request, slot.id, (message) =>
        this.emitDesktopTaskMessage(message),
      );
      this.taskQueue.syncQueuedTasks(this.desktopWorkerRequests, (message) =>
        this.emitDesktopTaskMessage(message),
      );

      try {
        slot.send({
          id: next.taskId,
          command: next.request.command,
          payload: next.request.payload,
        });
      } catch (error) {
        this.desktopWorkerRequests.delete(next.taskId);
        this.taskAssignments.delete(next.taskId);
        this.taskQueue.clearActiveIf(next.taskId);
        const errorMessage = error instanceof Error ? error.message : "Desktop worker request failed";
        this.emitTrackedTaskFailure(next.taskId, next.request.command, next.request.payload, errorMessage);
        next.request.reject(error);
        slot.stop("restart");
      }
    }
  }

  private dispatchSerialLane(lane: SerialWorkerLane) {
    const laneState = this.ensureSerialLane(lane);
    if (laneState.activeRequestId || !laneState.slot.isReadyIdle) {
      return;
    }

    while (laneState.queuedRequestIds.length > 0) {
      const nextRequestId = laneState.queuedRequestIds.shift();
      if (!nextRequestId) {
        return;
      }
      const pending = this.desktopWorkerRequests.get(nextRequestId);
      if (!pending) {
        continue;
      }

      laneState.activeRequestId = nextRequestId;
      try {
        laneState.slot.send({
          id: nextRequestId,
          command: pending.command,
          payload: pending.payload,
        });
      } catch (error) {
        laneState.activeRequestId = null;
        this.desktopWorkerRequests.delete(nextRequestId);
        pending.reject(error);
        laneState.slot.stop("restart");
      }
      return;
    }
  }

  private handleDesktopWorkerTaskEvent(slotId: string, taskId: string, payload: unknown) {
    if (this.taskAssignments.get(taskId) !== slotId) {
      return;
    }

    const pending = this.desktopWorkerRequests.get(taskId);
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
      this.emitDesktopTaskMessage({
        type: "update",
        task: taskUpdate,
      });
    }
  }

  private handleDesktopWorkerResponse(slotId: string, message: DesktopWorkerProtocolResponse) {
    const pending = this.desktopWorkerRequests.get(message.id);
    if (!pending) {
      return;
    }

    const lane = getDesktopWorkerExecutionLane(pending.command);
    if (lane === "task") {
      this.handleTrackedResponse(slotId, message, pending);
      return;
    }

    this.handleSerialResponse(slotId, lane, message, pending);
  }

  private handleTrackedResponse(
    slotId: string,
    message: DesktopWorkerProtocolResponse,
    pending: DesktopWorkerRuntimeRequest,
  ) {
    if (this.taskAssignments.get(message.id) !== slotId) {
      return;
    }

    this.desktopWorkerRequests.delete(message.id);
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
      this.emitDesktopTaskMessage({
        type: "update",
        task: taskUpdate,
      });
    }

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Desktop worker request failed"));
    }

    this.dispatchQueuedTrackedTasks();
  }

  private handleSerialResponse(
    slotId: string,
    lane: SerialWorkerLane,
    message: DesktopWorkerProtocolResponse,
    pending: DesktopWorkerRuntimeRequest,
  ) {
    const laneState = this.serialLanes.get(lane);
    if (!laneState || laneState.slot.id !== slotId || laneState.activeRequestId !== message.id) {
      return;
    }

    this.desktopWorkerRequests.delete(message.id);
    laneState.activeRequestId = null;
    laneState.slot.completeActiveRequest(message.id);

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Desktop worker request failed"));
    }

    this.dispatchSerialLane(lane);
  }

  private handleSlotExit(
    slotId: string,
    code: number | null,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    console.log(`[DesktopWorker:${slotId}] exited with code ${code}`);
    const lane = this.serialLaneForSlot(slotId);
    if (lane) {
      this.handleSerialSlotExit(lane, activeRequestId, stopMode);
      return;
    }

    this.handleTrackedSlotExit(slotId, activeRequestId, stopMode);
  }

  private handleTrackedSlotExit(
    slotId: string,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    if (activeRequestId && this.taskAssignments.get(activeRequestId) === slotId) {
      const pending = this.desktopWorkerRequests.get(activeRequestId);
      this.desktopWorkerRequests.delete(activeRequestId);
      this.taskAssignments.delete(activeRequestId);
      this.taskQueue.clearActiveIf(activeRequestId);

      if (pending && isDesktopTaskCommand(pending.command)) {
        this.emitTrackedTaskFailure(
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
  }

  private handleSerialSlotExit(
    lane: SerialWorkerLane,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    const laneState = this.serialLanes.get(lane);
    if (!laneState) {
      return;
    }

    if (activeRequestId && laneState.activeRequestId === activeRequestId) {
      const pending = this.desktopWorkerRequests.get(activeRequestId);
      this.desktopWorkerRequests.delete(activeRequestId);
      laneState.activeRequestId = null;
      pending?.reject(new Error("Desktop worker exited"));
    }

    if (stopMode === "shutdown") {
      this.failSerialLane(laneState, "Desktop worker exited");
      return;
    }

    laneState.slot.start();
  }

  private restartAssignedTaskSlot(taskId: string) {
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

  private failAllTrackedRequests(message: string) {
    this.taskQueue.clearQueued();
    for (const [taskId, pending] of [...this.desktopWorkerRequests.entries()]) {
      if (!isDesktopTaskCommand(pending.command)) {
        continue;
      }
      this.emitTrackedTaskFailure(taskId, pending.command, pending.payload, message);
      pending.reject(new Error(message));
      this.desktopWorkerRequests.delete(taskId);
      this.taskAssignments.delete(taskId);
      this.taskQueue.clearActiveIf(taskId);
    }
  }

  private failSerialLane(laneState: SerialWorkerLaneState, message: string) {
    if (laneState.activeRequestId) {
      const pending = this.desktopWorkerRequests.get(laneState.activeRequestId);
      this.desktopWorkerRequests.delete(laneState.activeRequestId);
      pending?.reject(new Error(message));
      laneState.activeRequestId = null;
    }

    for (const requestId of laneState.queuedRequestIds.splice(0)) {
      const pending = this.desktopWorkerRequests.get(requestId);
      this.desktopWorkerRequests.delete(requestId);
      pending?.reject(new Error(message));
    }
  }

  private serialLaneForSlot(slotId: string): SerialWorkerLane | null {
    for (const [lane, laneState] of this.serialLanes.entries()) {
      if (laneState.slot.id === slotId) {
        return lane;
      }
    }
    return null;
  }
}

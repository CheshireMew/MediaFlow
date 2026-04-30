import { startDesktopWorkerProcess, type DesktopWorkerProcessFactory } from "./workerProcess";
import type { DesktopWorkerProtocolResponse } from "./workerProtocol";
import type { DesktopWorkerRuntimeRequest } from "./workerRequestTypes";
import { getDesktopWorkerExecutionLane } from "./workerCommandLanes";
import {
  DesktopWorkerSlot,
  type DesktopWorkerSlotStopMode,
} from "./workerSlot";
import {
  DesktopWorkerSerialLanes,
  type SerialWorkerLane,
} from "./workerSerialLanes";

export class DesktopWorkerSupervisor {
  private requestSequence = 0;
  private readonly desktopWorkerRequests = new Map<string, DesktopWorkerRuntimeRequest>();
  private readonly processFactory: DesktopWorkerProcessFactory;
  private readonly serialLanes: DesktopWorkerSerialLanes;

  constructor(processFactory: DesktopWorkerProcessFactory = startDesktopWorkerProcess) {
    this.processFactory = processFactory;
    this.serialLanes = new DesktopWorkerSerialLanes({
      requests: this.desktopWorkerRequests,
      createSlot: (slotId) => this.createSlot(slotId),
    });
  }

  stop() {
    this.serialLanes.stopAll("Desktop worker exited");
  }

  prewarm() {
    this.serialLanes.prewarmControlLane();
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

    return new Promise<T>((resolve, reject) => {
      this.desktopWorkerRequests.set(id, {
        command,
        payload: {
          ...normalizedPayload,
          task_id: id,
        },
        resolve: (value) => resolve(value as T),
        reject,
      });

      if (!this.serialLanes.enqueue(lane as SerialWorkerLane, id)) {
        this.desktopWorkerRequests.delete(id);
        reject(new Error("Desktop worker process could not be started"));
      }
    });
  }

  private createSlot(slotId: string) {
    return new DesktopWorkerSlot(
      slotId,
      {
        onReady: (readySlotId) => this.handleSlotReady(readySlotId),
        onEvent: (_readySlotId, event, payload) => {
          console.log("[DesktopWorker event]", event, payload);
        },
        onTaskEvent: () => undefined,
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
    this.serialLanes.handleSlotReady(slotId);
  }

  private handleDesktopWorkerResponse(slotId: string, message: DesktopWorkerProtocolResponse) {
    const pending = this.desktopWorkerRequests.get(message.id);
    if (!pending) {
      return;
    }

    const lane = getDesktopWorkerExecutionLane(pending.command);
    this.serialLanes.handleResponse(slotId, lane as SerialWorkerLane, message, pending);
  }

  private handleSlotExit(
    slotId: string,
    code: number | null,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    console.log(`[DesktopWorker:${slotId}] exited with code ${code}`);
    this.serialLanes.handleSlotExit(slotId, activeRequestId, stopMode);
  }
}

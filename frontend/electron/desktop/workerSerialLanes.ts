import type { DesktopWorkerRuntimeRequest } from "./taskTypes";
import type {
  DesktopWorkerExecutionLane,
} from "./workerCommandLanes";
import {
  DesktopWorkerSlot,
  type DesktopWorkerSlotStopMode,
} from "./workerSlot";
import type { DesktopWorkerProtocolResponse } from "./workerProtocol";

export type SerialWorkerLane = Exclude<DesktopWorkerExecutionLane, "task">;

type SerialWorkerLaneState = {
  slot: DesktopWorkerSlot;
  queuedRequestIds: string[];
  activeRequestId: string | null;
};

type SerialLaneArgs = {
  requests: Map<string, DesktopWorkerRuntimeRequest>;
  createSlot: (slotId: string) => DesktopWorkerSlot;
};

export class DesktopWorkerSerialLanes {
  private readonly requests: Map<string, DesktopWorkerRuntimeRequest>;
  private readonly createSlot: (slotId: string) => DesktopWorkerSlot;
  private readonly serialLanes = new Map<SerialWorkerLane, SerialWorkerLaneState>();

  constructor(args: SerialLaneArgs) {
    this.requests = args.requests;
    this.createSlot = args.createSlot;
  }

  prewarmControlLane() {
    this.ensureLane("control").slot.start();
  }

  stopAll(message: string) {
    for (const laneState of this.serialLanes.values()) {
      laneState.slot.stop("shutdown");
      this.failLane(laneState, message);
    }
  }

  enqueue(lane: SerialWorkerLane, requestId: string) {
    const laneState = this.ensureLane(lane);
    if (!laneState.slot.start()) {
      return false;
    }

    laneState.queuedRequestIds.push(requestId);
    this.dispatch(lane);
    return true;
  }

  handleSlotReady(slotId: string) {
    const lane = this.laneForSlot(slotId);
    if (!lane) {
      return false;
    }
    this.dispatch(lane);
    return true;
  }

  handleResponse(
    slotId: string,
    lane: SerialWorkerLane,
    message: DesktopWorkerProtocolResponse,
    pending: DesktopWorkerRuntimeRequest,
  ) {
    const laneState = this.serialLanes.get(lane);
    if (!laneState || laneState.slot.id !== slotId || laneState.activeRequestId !== message.id) {
      return false;
    }

    this.requests.delete(message.id);
    laneState.activeRequestId = null;
    laneState.slot.completeActiveRequest(message.id);

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Desktop worker request failed"));
    }

    this.dispatch(lane);
    return true;
  }

  handleSlotExit(
    slotId: string,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    const lane = this.laneForSlot(slotId);
    if (!lane) {
      return false;
    }
    this.handleLaneSlotExit(lane, activeRequestId, stopMode);
    return true;
  }

  private ensureLane(lane: SerialWorkerLane) {
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

  private dispatch(lane: SerialWorkerLane) {
    const laneState = this.ensureLane(lane);
    if (laneState.activeRequestId || !laneState.slot.isReadyIdle) {
      return;
    }

    while (laneState.queuedRequestIds.length > 0) {
      const nextRequestId = laneState.queuedRequestIds.shift();
      if (!nextRequestId) {
        return;
      }
      const pending = this.requests.get(nextRequestId);
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
        this.requests.delete(nextRequestId);
        pending.reject(error);
        laneState.slot.stop("restart");
      }
      return;
    }
  }

  private handleLaneSlotExit(
    lane: SerialWorkerLane,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) {
    const laneState = this.serialLanes.get(lane);
    if (!laneState) {
      return;
    }

    if (activeRequestId && laneState.activeRequestId === activeRequestId) {
      const pending = this.requests.get(activeRequestId);
      this.requests.delete(activeRequestId);
      laneState.activeRequestId = null;
      pending?.reject(new Error("Desktop worker exited"));
    }

    if (stopMode === "shutdown") {
      this.failLane(laneState, "Desktop worker exited");
      return;
    }

    laneState.slot.start();
  }

  private failLane(laneState: SerialWorkerLaneState, message: string) {
    if (laneState.activeRequestId) {
      const pending = this.requests.get(laneState.activeRequestId);
      this.requests.delete(laneState.activeRequestId);
      pending?.reject(new Error(message));
      laneState.activeRequestId = null;
    }

    for (const requestId of laneState.queuedRequestIds.splice(0)) {
      const pending = this.requests.get(requestId);
      this.requests.delete(requestId);
      pending?.reject(new Error(message));
    }
  }

  private laneForSlot(slotId: string): SerialWorkerLane | null {
    for (const [lane, laneState] of this.serialLanes.entries()) {
      if (laneState.slot.id === slotId) {
        return lane;
      }
    }
    return null;
  }
}

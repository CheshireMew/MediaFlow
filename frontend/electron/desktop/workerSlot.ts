import type { ChildProcess } from "child_process";
import { startDesktopWorkerProcess, type DesktopWorkerProcessFactory } from "./workerProcess";
import {
  handleDesktopWorkerProtocolLine,
  type DesktopWorkerProtocolResponse,
} from "./workerProtocol";

export type DesktopWorkerSlotState = "starting" | "idle" | "busy" | "stopped";
export type DesktopWorkerSlotStopMode = "restart" | "shutdown";

export type WorkerSlotRequest = {
  id: string;
  command: string;
  payload: Record<string, unknown>;
};

type DesktopWorkerSlotCallbacks = {
  onReady: (slotId: string) => void;
  onEvent: (slotId: string, event: string, payload: unknown, requestId: string | null) => void;
  onTaskEvent: (slotId: string, taskId: string, payload: unknown) => void;
  onResponse: (slotId: string, response: DesktopWorkerProtocolResponse) => void;
  onExit: (
    slotId: string,
    code: number | null,
    activeRequestId: string | null,
    stopMode: DesktopWorkerSlotStopMode | null,
  ) => void;
  onLog: (slotId: string, line: string) => void;
  onParseError: (slotId: string, line: string, error: unknown) => void;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class DesktopWorkerSlot {
  state: DesktopWorkerSlotState = "stopped";
  activeRequestId: string | null = null;
  readonly id: string;

  private workerProcess: ChildProcess | null = null;
  private ready = false;
  private readyWaiters: ReadyWaiter[] = [];
  private stopMode: DesktopWorkerSlotStopMode | null = null;
  private readonly callbacks: DesktopWorkerSlotCallbacks;
  private readonly processFactory: DesktopWorkerProcessFactory;

  constructor(
    id: string,
    callbacks: DesktopWorkerSlotCallbacks,
    processFactory: DesktopWorkerProcessFactory = startDesktopWorkerProcess,
  ) {
    this.id = id;
    this.callbacks = callbacks;
    this.processFactory = processFactory;
  }

  get isReadyIdle() {
    return this.ready && this.state === "idle" && this.workerProcess?.stdin?.writable;
  }

  start() {
    if (this.workerProcess && this.workerProcess.exitCode === null) {
      return true;
    }

    this.ready = false;
    this.state = "starting";
    this.stopMode = null;
    this.workerProcess = this.processFactory({
      onLine: (line) => this.handleLine(line),
      onClose: (code) => this.handleClose(code),
    });

    if (!this.workerProcess) {
      this.state = "stopped";
      this.rejectReadyWaiters(new Error("Desktop worker process could not be started"));
      return false;
    }

    return true;
  }

  send(request: WorkerSlotRequest) {
    if (!this.ready || !this.workerProcess?.stdin?.writable) {
      throw new Error("Desktop worker slot is not writable");
    }
    if (this.activeRequestId) {
      throw new Error(`Desktop worker slot ${this.id} is already busy`);
    }

    this.activeRequestId = request.id;
    this.state = "busy";
    this.workerProcess.stdin.write(`${JSON.stringify(request)}\n`);
  }

  completeActiveRequest(requestId: string) {
    if (this.activeRequestId !== requestId) {
      return false;
    }

    this.activeRequestId = null;
    if (this.ready) {
      this.state = "idle";
    }
    return true;
  }

  clearActiveRequest(requestId: string) {
    if (this.activeRequestId !== requestId) {
      return false;
    }
    this.activeRequestId = null;
    return true;
  }

  stop(mode: DesktopWorkerSlotStopMode = "shutdown") {
    this.stopMode = mode;
    this.ready = false;

    if (this.workerProcess?.pid) {
      try {
        console.log(`Killing desktop worker slot ${this.id} process ${this.workerProcess.pid}`);
        process.kill(this.workerProcess.pid, "SIGTERM");
      } catch (error) {
        console.error(`Failed to kill desktop worker slot ${this.id}:`, error);
      }
      return;
    }

    this.state = "stopped";
    this.rejectReadyWaiters(new Error("Desktop worker slot stopped"));
  }

  waitUntilReady(timeoutMs = 15000): Promise<void> {
    if (this.ready) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.readyWaiters = this.readyWaiters.filter((candidate) => candidate !== waiter);
          reject(new Error("Desktop worker startup timed out"));
        }, timeoutMs),
      };
      this.readyWaiters.push(waiter);
    });
  }

  private resolveReady() {
    this.ready = true;
    if (!this.activeRequestId) {
      this.state = "idle";
    }

    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve();
    });
    this.callbacks.onReady(this.id);
  }

  private rejectReadyWaiters(error: Error) {
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    });
  }

  private handleLine(line: string) {
    handleDesktopWorkerProtocolLine(line, {
      onLog: (rawLine) => this.callbacks.onLog(this.id, rawLine),
      onReady: () => this.resolveReady(),
        onEvent: (event, payload, requestId) => this.callbacks.onEvent(this.id, event, payload, requestId),
      onTaskEvent: (taskId, payload) => this.callbacks.onTaskEvent(this.id, taskId, payload),
      onResponse: (response) => this.callbacks.onResponse(this.id, response),
      onParseError: (rawLine, error) => this.callbacks.onParseError(this.id, rawLine, error),
    });
  }

  private handleClose(code: number | null) {
    const activeRequestId = this.activeRequestId;
    const stopMode = this.stopMode;

    this.ready = false;
    this.state = "stopped";
    this.workerProcess = null;
    this.activeRequestId = null;
    this.stopMode = null;
    this.rejectReadyWaiters(new Error("Desktop worker exited before becoming ready"));
    this.callbacks.onExit(this.id, code, activeRequestId, stopMode);
  }
}

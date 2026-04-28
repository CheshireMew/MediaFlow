import { BrowserWindow } from "electron";
import type { ChildProcess } from "child_process";
import {
  buildDesktopTask,
  buildDesktopTaskProgressUpdate,
  buildDesktopTaskResponseUpdate,
  getDesktopTaskSnapshot,
  isTrackedDesktopCommand,
} from "./taskMapper";
import {
  planCancelDesktopTask,
  planPauseDesktopTask,
  planResumeDesktopTask,
} from "./taskPlans";
import type { DesktopTaskType } from "./taskTypes";
import { DesktopTaskHistoryStore } from "./historyStore";
import {
  DESKTOP_TASK_EVENT_CHANNEL,
  DESKTOP_WORKER_EVENT_CHANNELS,
} from "./bridgeContract";
import { startDesktopWorkerProcess } from "./workerProcess";
import {
  handleDesktopWorkerProtocolLine,
  type DesktopWorkerProtocolResponse,
} from "./workerProtocol";

type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class DesktopWorkerSupervisor {
  private desktopWorkerProcess: ChildProcess | null = null;
  private desktopWorkerReady = false;
  private desktopWorkerId = 0;
  private desktopWorkerReadyWaiters: Array<() => void> = [];
  private activeDesktopWorkerTaskId: string | null = null;
  private desktopWorkerStopMode: "restart" | "shutdown" | null = null;
  private readonly queuedDesktopWorkerTaskIds: string[] = [];
  private readonly pausedDesktopWorkerTasks = new Map<
    string,
    {
      command: DesktopTaskType;
      payload: Record<string, unknown>;
    }
  >();
  private readonly desktopWorkerRequests = new Map<string, DesktopWorkerRequest>();

  constructor(private readonly historyStore: DesktopTaskHistoryStore) {}

  stop() {
    this.stopDesktopWorker();
  }

  prewarm() {
    this.startDesktopWorker();
  }

  listTasks() {
    this.historyStore.ensureLoaded();
    return getDesktopTaskSnapshot({
      activeTaskId: this.activeDesktopWorkerTaskId,
      queuedTaskIds: this.queuedDesktopWorkerTaskIds,
      pausedTasks: this.pausedDesktopWorkerTasks,
      requests: this.desktopWorkerRequests,
      historyTasks: this.historyStore.list(),
    });
  }

  request<T = unknown>(command: string, payload?: Record<string, unknown>) {
    if (!this.startDesktopWorker()) {
      return Promise.reject(new Error("Desktop worker process could not be started"));
    }
    const normalizedPayload = payload ?? {};
    const requestedTaskId =
      typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.trim().length > 0
        ? normalizedPayload.task_id
        : `worker-${Date.now()}-${++this.desktopWorkerId}`;
    const id = requestedTaskId;
    const trackedPayload = this.resolveTrackedPayload(id, normalizedPayload);

    return this.waitForDesktopWorkerReady()
      .then(
        () =>
          new Promise<T>((resolve, reject) => {
            if (!this.desktopWorkerProcess?.stdin?.writable) {
              reject(new Error("Desktop worker stdin is not writable"));
              return;
            }

            this.historyStore.remove(id);
            this.desktopWorkerRequests.set(id, { command, payload: trackedPayload, resolve, reject });
            if (isTrackedDesktopCommand(command)) {
              this.queuedDesktopWorkerTaskIds.push(id);
              this.emitDesktopTaskMessage({
                type: "update",
                task: {
                  ...buildDesktopTask(id, command, trackedPayload, "pending", 0, "Queued"),
                  queue_position: this.queuedDesktopWorkerTaskIds.length,
                },
              });
              this.dispatchNextDesktopWorkerTask();
              return;
            }
            try {
              this.desktopWorkerProcess.stdin.write(
                `${JSON.stringify({ id, command, payload: trackedPayload })}\n`,
              );
            } catch (error) {
              this.desktopWorkerRequests.delete(id);
              reject(error);
            }
          }),
      )
      .catch((error) => {
        if (isTrackedDesktopCommand(command)) {
          this.emitTrackedTaskFailure(
            id,
            command,
            trackedPayload,
            error instanceof Error ? error.message : "Desktop worker request failed",
          );
        }
        throw error;
      });
  }

  async pauseTask(taskId: string) {
    const plan = planPauseDesktopTask(taskId, {
      activeTaskId: this.activeDesktopWorkerTaskId,
      queuedTaskIds: this.queuedDesktopWorkerTaskIds,
      pausedTasks: this.pausedDesktopWorkerTasks,
      requests: this.desktopWorkerRequests,
    });
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
      this.removeQueuedDesktopWorkerTask(taskId);
    }
    if (plan.addPausedTask) {
      this.pausedDesktopWorkerTasks.set(taskId, plan.addPausedTask);
    }
    if (plan.emitTask) {
      this.emitDesktopTaskMessage({ type: "update", task: plan.emitTask });
    }
    if (plan.rejectMessage) {
      pending.reject(new Error(plan.rejectMessage));
    }
    if (plan.shouldRestartWorker) {
      this.stopDesktopWorker("restart");
    }

    return { status: plan.status };
  }

  async resumeTask(taskId: string) {
    const plan = planResumeDesktopTask(taskId, this.pausedDesktopWorkerTasks);
    if (plan.status === "ignored" || !plan.resumeTask) {
      return { status: "ignored" };
    }

    if (plan.removePaused) {
      this.pausedDesktopWorkerTasks.delete(taskId);
    }
    void this.request(plan.resumeTask.command, plan.resumeTask.payload).catch((error) => {
      console.error(`[DesktopWorker] Failed to resume ${taskId}:`, error);
    });
    return { status: plan.status };
  }

  async cancelTask(taskId: string) {
    if (this.historyStore.remove(taskId)) {
      this.emitDesktopTaskMessage({ type: "delete", task_id: taskId });
      return { status: "removed" };
    }

    const plan = planCancelDesktopTask(taskId, {
      activeTaskId: this.activeDesktopWorkerTaskId,
      queuedTaskIds: this.queuedDesktopWorkerTaskIds,
      pausedTasks: this.pausedDesktopWorkerTasks,
      requests: this.desktopWorkerRequests,
    });
    if (plan.status === "ignored") {
      return { status: "ignored" };
    }

    const pending = this.desktopWorkerRequests.get(taskId);

    if (plan.removePaused) {
      this.pausedDesktopWorkerTasks.delete(taskId);
    }
    if (plan.removeRequest) {
      this.desktopWorkerRequests.delete(taskId);
    }
    if (plan.removeQueued) {
      this.removeQueuedDesktopWorkerTask(taskId);
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
    if (plan.shouldRestartWorker) {
      this.stopDesktopWorker("restart");
    }
    return { status: plan.status };
  }

  private emitDesktopTaskMessage(message: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_TASK_EVENT_CHANNEL, message);
    }
  }

  private emitDesktopProgress(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
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
    const taskUpdate = buildDesktopTaskResponseUpdate({
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

  private syncQueuedDesktopWorkerTasks() {
    this.queuedDesktopWorkerTaskIds.forEach((taskId, index) => {
      const pending = this.desktopWorkerRequests.get(taskId);
      if (!pending || !isTrackedDesktopCommand(pending.command)) {
        return;
      }

      this.emitDesktopTaskMessage({
        type: "update",
        task: {
          ...buildDesktopTask(taskId, pending.command, pending.payload, "pending", 0, "Queued"),
          queue_position: index + 1,
        },
      });
    });
  }

  private removeQueuedDesktopWorkerTask(taskId: string) {
    const index = this.queuedDesktopWorkerTaskIds.indexOf(taskId);
    if (index === -1) {
      return false;
    }

    this.queuedDesktopWorkerTaskIds.splice(index, 1);
    this.syncQueuedDesktopWorkerTasks();
    return true;
  }

  private dispatchNextDesktopWorkerTask() {
    if (
      !this.desktopWorkerReady ||
      this.activeDesktopWorkerTaskId ||
      !this.desktopWorkerProcess?.stdin?.writable
    ) {
      return;
    }

    const nextTaskId = this.queuedDesktopWorkerTaskIds.shift();
    if (!nextTaskId) {
      return;
    }

    const pending = this.desktopWorkerRequests.get(nextTaskId);
    if (!pending) {
      this.syncQueuedDesktopWorkerTasks();
      this.dispatchNextDesktopWorkerTask();
      return;
    }

    this.activeDesktopWorkerTaskId = nextTaskId;
    if (isTrackedDesktopCommand(pending.command)) {
      this.emitDesktopTaskMessage({
        type: "update",
        task: {
          ...buildDesktopTask(nextTaskId, pending.command, pending.payload, "running", 0, "Starting"),
          queue_position: null,
        },
      });
    }
    this.syncQueuedDesktopWorkerTasks();
    try {
      this.desktopWorkerProcess.stdin.write(
        `${JSON.stringify({ id: nextTaskId, command: pending.command, payload: pending.payload })}\n`,
      );
    } catch (error) {
      this.desktopWorkerRequests.delete(nextTaskId);
      this.activeDesktopWorkerTaskId = null;
      const taskUpdate = buildDesktopTaskResponseUpdate({
        taskId: nextTaskId,
        request: pending,
        ok: false,
        error: error instanceof Error ? error.message : "Desktop worker request failed",
      });
      if (taskUpdate) {
        this.historyStore.upsert(taskUpdate);
        this.emitDesktopTaskMessage({
          type: "update",
          task: taskUpdate,
        });
      }
      pending.reject(error);
      this.dispatchNextDesktopWorkerTask();
    }
  }

  private resolveDesktopWorkerReady() {
    this.desktopWorkerReady = true;
    const waiters = [...this.desktopWorkerReadyWaiters];
    this.desktopWorkerReadyWaiters = [];
    waiters.forEach((waiter) => waiter());
  }

  private handleDesktopWorkerLine(line: string) {
    handleDesktopWorkerProtocolLine(line, {
      onLog: (rawLine) => {
        console.log(`[DesktopWorker] ${rawLine}`);
      },
      onReady: () => {
        console.log("[DesktopWorker] ready");
        this.resolveDesktopWorkerReady();
        this.dispatchNextDesktopWorkerTask();
      },
      onEvent: (event, payload) => {
        const channel =
          DESKTOP_WORKER_EVENT_CHANNELS[
            event as keyof typeof DESKTOP_WORKER_EVENT_CHANNELS
          ];
        if (channel) {
          this.emitDesktopProgress(channel, payload);
        } else {
          console.log("[DesktopWorker event]", event, payload);
        }
      },
      onTaskEvent: (taskId, payload) => this.handleDesktopWorkerTaskEvent(taskId, payload),
      onResponse: (response) => this.handleDesktopWorkerResponse(response),
      onParseError: (rawLine, error) => {
        console.error("[DesktopWorker] Failed to parse line", rawLine, error);
      },
    });
  }

  private handleDesktopWorkerTaskEvent(taskId: string, payload: unknown) {
    const pending = this.desktopWorkerRequests.get(taskId);
    if (
      !pending ||
      !isTrackedDesktopCommand(pending.command) ||
      !payload ||
      typeof payload !== "object"
    ) {
      return;
    }

    const taskUpdate = buildDesktopTaskProgressUpdate({
      taskId,
      request: pending,
      payload,
    });
    if (taskUpdate) {
      this.emitDesktopTaskMessage({
        type: "update",
        task: taskUpdate,
      });
    }
  }

  private handleDesktopWorkerResponse(message: DesktopWorkerProtocolResponse) {
    const pending = this.desktopWorkerRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.desktopWorkerRequests.delete(message.id);
    if (this.activeDesktopWorkerTaskId === message.id) {
      this.activeDesktopWorkerTaskId = null;
      this.dispatchNextDesktopWorkerTask();
    }

    const taskUpdate = buildDesktopTaskResponseUpdate({
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
  }

  private startDesktopWorker() {
    if (this.desktopWorkerProcess && this.desktopWorkerProcess.exitCode === null) {
      return true;
    }

    this.desktopWorkerReady = false;
    this.desktopWorkerProcess = startDesktopWorkerProcess({
      onLine: (line) => this.handleDesktopWorkerLine(line),
      onClose: (code) => {
        console.log(`[DesktopWorker] exited with code ${code}`);
        this.desktopWorkerReady = false;
        this.desktopWorkerProcess = null;
        this.activeDesktopWorkerTaskId = null;

        const stopMode = this.desktopWorkerStopMode;
        this.desktopWorkerStopMode = null;

        if (stopMode === "restart") {
          const queuedTaskIdSet = new Set(this.queuedDesktopWorkerTaskIds);
          for (const [requestId, pending] of [...this.desktopWorkerRequests.entries()]) {
            if (queuedTaskIdSet.has(requestId)) {
              continue;
            }
            pending.reject(new Error("Desktop worker restarted"));
            this.desktopWorkerRequests.delete(requestId);
          }
          this.desktopWorkerReadyWaiters = [];
          if (this.desktopWorkerRequests.size > 0 || this.queuedDesktopWorkerTaskIds.length > 0) {
            this.startDesktopWorker();
          }
          return;
        }

        this.queuedDesktopWorkerTaskIds.length = 0;
        for (const [taskId, pending] of [...this.desktopWorkerRequests.entries()]) {
          if (isTrackedDesktopCommand(pending.command)) {
            this.emitTrackedTaskFailure(taskId, pending.command, pending.payload, "Desktop worker exited");
          }
          pending.reject(new Error("Desktop worker exited"));
        }
        this.desktopWorkerRequests.clear();
        this.desktopWorkerReadyWaiters = [];
      },
    });
    return this.desktopWorkerProcess !== null;
  }

  private stopDesktopWorker(mode: "restart" | "shutdown" = "shutdown") {
    this.desktopWorkerStopMode = mode;
    if (this.desktopWorkerProcess?.pid) {
      try {
        console.log(`Killing desktop worker process ${this.desktopWorkerProcess.pid}`);
        process.kill(this.desktopWorkerProcess.pid, "SIGTERM");
      } catch (error) {
        console.error("Failed to kill desktop worker:", error);
      }
      this.desktopWorkerProcess = null;
    } else if (
      mode === "restart" &&
      (this.desktopWorkerRequests.size > 0 || this.queuedDesktopWorkerTaskIds.length > 0)
    ) {
      this.desktopWorkerStopMode = null;
      void this.startDesktopWorker();
    }
    this.desktopWorkerReady = false;
    this.activeDesktopWorkerTaskId = null;
  }

  private waitForDesktopWorkerReady(timeoutMs = 15000): Promise<void> {
    if (this.desktopWorkerReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.desktopWorkerReadyWaiters = this.desktopWorkerReadyWaiters.filter((waiter) => waiter !== onReady);
        reject(new Error("Desktop worker startup timed out"));
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timer);
        this.desktopWorkerProcess?.removeListener("close", onExit);
        resolve();
      };
      const onExit = () => {
        clearTimeout(timer);
        this.desktopWorkerReadyWaiters = this.desktopWorkerReadyWaiters.filter((waiter) => waiter !== onReady);
        reject(new Error("Desktop worker exited before becoming ready"));
      };

      this.desktopWorkerProcess?.once("close", onExit);

      this.desktopWorkerReadyWaiters.push(onReady);
    });
  }
}

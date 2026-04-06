import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import {
  buildDesktopTask,
  buildDesktopTaskProgressUpdate,
  buildDesktopTaskResponseUpdate,
  getDesktopTaskSnapshot,
  isTrackedDesktopCommand,
  planCancelDesktopTask,
  planPauseDesktopTask,
  planResumeDesktopTask,
  type DesktopTaskType,
} from "../desktopTaskState";
import { DesktopTaskHistoryStore } from "./historyStore";
import {
  DESKTOP_TASK_EVENT_CHANNEL,
  DESKTOP_WORKER_EVENT_CHANNELS,
} from "./bridgeContract";
import {
  buildDesktopRuntimeEnv,
  isDesktopDevMode,
  resolveDesktopDevWorkerLaunch,
  resolveBundledDesktopWorkerExecutable,
} from "../desktopRuntime";

type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const DESKTOP_WORKER_PREFIX = "__MEDIAFLOW_WORKER__";

export class DesktopWorkerSupervisor {
  private desktopWorkerProcess: ChildProcess | null = null;
  private desktopWorkerReady = false;
  private desktopWorkerId = 0;
  private desktopWorkerStdoutBuffer = "";
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
    this.startDesktopWorker();
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

  private getDesktopWorkerCommand(): { command: string; args: string[]; cwd: string } | null {
    if (!isDesktopDevMode() && app.isPackaged) {
      const workerExe = resolveBundledDesktopWorkerExecutable();
      if (!fs.existsSync(workerExe)) {
        console.error("Bundled desktop worker executable not found at:", workerExe);
        return null;
      }

      return {
        command: workerExe,
        args: [],
        cwd: path.dirname(workerExe),
      };
    }

    return resolveDesktopDevWorkerLaunch();
  }

  private resolveDesktopWorkerReady() {
    this.desktopWorkerReady = true;
    const waiters = [...this.desktopWorkerReadyWaiters];
    this.desktopWorkerReadyWaiters = [];
    waiters.forEach((waiter) => waiter());
  }

  private handleDesktopWorkerLine(line: string) {
    if (!line.startsWith(DESKTOP_WORKER_PREFIX)) {
      console.log(`[DesktopWorker] ${line}`);
      return;
    }

    try {
      const message = JSON.parse(line.slice(DESKTOP_WORKER_PREFIX.length)) as {
        type: string;
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: string;
        event?: string;
        payload?: unknown;
      };

      if (message.type === "ready") {
        console.log("[DesktopWorker] ready");
        this.resolveDesktopWorkerReady();
        this.dispatchNextDesktopWorkerTask();
        return;
      }

      if (message.type === "event") {
        if (message.event) {
          const channel =
            DESKTOP_WORKER_EVENT_CHANNELS[
              message.event as keyof typeof DESKTOP_WORKER_EVENT_CHANNELS
            ];
          if (channel) {
            this.emitDesktopProgress(channel, message.payload);
          } else {
            console.log("[DesktopWorker event]", message.event, message.payload);
          }
        }

        if (message.id) {
          const pending = this.desktopWorkerRequests.get(message.id);
          if (
            pending &&
            isTrackedDesktopCommand(pending.command) &&
            message.payload &&
            typeof message.payload === "object"
          ) {
            const taskUpdate = buildDesktopTaskProgressUpdate({
              taskId: message.id,
              request: pending,
              payload: message.payload,
            });
            if (taskUpdate) {
              this.emitDesktopTaskMessage({
                type: "update",
                task: taskUpdate,
              });
            }
          }
        }
        return;
      }

      if (message.type === "response" && message.id) {
        const pending = this.desktopWorkerRequests.get(message.id);
        if (!pending) {
          return;
        }

        this.desktopWorkerRequests.delete(message.id);
        if (this.activeDesktopWorkerTaskId === message.id) {
          this.activeDesktopWorkerTaskId = null;
          this.dispatchNextDesktopWorkerTask();
        }
        if (message.ok) {
          const taskUpdate = buildDesktopTaskResponseUpdate({
            taskId: message.id,
            request: pending,
            ok: true,
            result: message.result,
          });
          if (taskUpdate) {
            this.historyStore.upsert(taskUpdate);
            this.emitDesktopTaskMessage({
              type: "update",
              task: taskUpdate,
            });
          }
          pending.resolve(message.result);
        } else {
          const taskUpdate = buildDesktopTaskResponseUpdate({
            taskId: message.id,
            request: pending,
            ok: false,
            error: message.error,
          });
          if (taskUpdate) {
            this.historyStore.upsert(taskUpdate);
            this.emitDesktopTaskMessage({
              type: "update",
              task: taskUpdate,
            });
          }
          pending.reject(new Error(message.error || "Desktop worker request failed"));
        }
      }
    } catch (error) {
      console.error("[DesktopWorker] Failed to parse line", line, error);
    }
  }

  private startDesktopWorker() {
    if (this.desktopWorkerProcess && this.desktopWorkerProcess.exitCode === null) {
      return;
    }

    const workerCommand = this.getDesktopWorkerCommand();
    if (!workerCommand) {
      return;
    }

    this.desktopWorkerReady = false;
    this.desktopWorkerStdoutBuffer = "";
    console.log("Starting desktop worker:", workerCommand.command, workerCommand.args.join(" "));
    this.desktopWorkerProcess = spawn(workerCommand.command, workerCommand.args, {
      cwd: workerCommand.cwd,
      detached: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...buildDesktopRuntimeEnv(),
      },
    });

    this.desktopWorkerProcess.stdout?.on("data", (data) => {
      this.desktopWorkerStdoutBuffer += data.toString();
      let newlineIndex = this.desktopWorkerStdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = this.desktopWorkerStdoutBuffer.slice(0, newlineIndex).trim();
        this.desktopWorkerStdoutBuffer = this.desktopWorkerStdoutBuffer.slice(newlineIndex + 1);
        if (line) {
          this.handleDesktopWorkerLine(line);
        }
        newlineIndex = this.desktopWorkerStdoutBuffer.indexOf("\n");
      }
    });

    this.desktopWorkerProcess.stderr?.on("data", (data) => {
      console.error(`[DesktopWorker ERR] ${data}`);
    });

    this.desktopWorkerProcess.on("close", (code) => {
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
    });
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
      this.startDesktopWorker();
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
        resolve();
      };

      this.desktopWorkerReadyWaiters.push(onReady);
    });
  }
}

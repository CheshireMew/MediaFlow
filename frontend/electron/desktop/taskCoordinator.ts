import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  DESKTOP_TASK_OWNER_MODE,
  DESKTOP_WORKER_PROTOCOL_VERSION,
} from "../../src/contracts/runtimeContracts";
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
  buildDesktopRuntimeEnv,
  isDesktopDevMode,
  resolveBundledBackendExecutable,
} from "../desktopRuntime";


type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const DESKTOP_WORKER_PREFIX = "__MEDIAFLOW_WORKER__";
const DESKTOP_BRIDGE_CAPABILITIES = [
  "openFile",
  "openSubtitleFile",
  "readFile",
  "showSaveDialog",
  "selectDirectory",
  "showInExplorer",
  "fetchCookies",
  "extractDouyinData",
  "getPathForFile",
  "writeFile",
  "readBinaryFile",
  "writeBinaryFile",
  "getFileSize",
  "resolveExistingPath",
  "saveFile",
  "getDesktopRuntimeInfo",
  "desktopPing",
  "listDesktopTasks",
  "desktopTranscribe",
  "desktopTranslate",
  "desktopSynthesize",
  "getDesktopSettings",
  "updateDesktopSettings",
  "setDesktopActiveProvider",
  "testDesktopProvider",
  "listDesktopGlossary",
  "addDesktopGlossaryTerm",
  "deleteDesktopGlossaryTerm",
  "updateDesktopYtDlp",
  "analyzeDesktopUrl",
  "saveDesktopCookies",
  "desktopDownload",
  "desktopExtract",
  "getDesktopOcrResults",
  "detectDesktopSilence",
  "desktopTranscribeSegment",
  "desktopTranslateSegment",
  "uploadDesktopWatermark",
  "getDesktopLatestWatermark",
  "desktopEnhance",
  "desktopClean",
  "pauseDesktopTask",
  "resumeDesktopTask",
  "cancelDesktopTask",
  "onDesktopTaskEvent",
  "onDesktopTranscribeProgress",
  "onDesktopTranslateProgress",
  "onDesktopSynthesizeProgress",
  "minimize",
  "maximize",
  "close",
] as const;


export class DesktopTaskCoordinator {
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

  registerIpcHandlers() {
    ipcMain.handle("desktop:transcribe", async (_event, payload) => {
      return await this.requestDesktopWorker("transcribe", payload);
    });
    ipcMain.handle("desktop:get-runtime-info", async () => {
      const ping = await this.requestDesktopWorker<{
        status: "pong";
        protocol_version?: number;
        app_version?: string | null;
      }>("ping", {});

      return {
        status: "pong" as const,
        contract_version: DESKTOP_BRIDGE_CONTRACT_VERSION,
        bridge_version: app.getVersion(),
        task_owner_mode: DESKTOP_TASK_OWNER_MODE,
        capabilities: [...DESKTOP_BRIDGE_CAPABILITIES],
        worker: {
          protocol_version: ping.protocol_version ?? DESKTOP_WORKER_PROTOCOL_VERSION,
          app_version: ping.app_version ?? null,
        },
      };
    });
    ipcMain.handle("desktop:ping", async () => {
      return await this.requestDesktopWorker("ping", {});
    });
    ipcMain.handle("desktop:list-tasks", async () => this.listTasks());
    ipcMain.handle("desktop:translate", async (_event, payload) => {
      return await this.requestDesktopWorker("translate", payload);
    });
    ipcMain.handle("desktop:synthesize", async (_event, payload) => {
      return await this.requestDesktopWorker("synthesize", payload);
    });
    ipcMain.handle("desktop:get-settings", async () => {
      return await this.requestDesktopWorker("get_settings", {});
    });
    ipcMain.handle("desktop:update-settings", async (_event, payload) => {
      return await this.requestDesktopWorker("update_settings", payload);
    });
    ipcMain.handle("desktop:set-active-provider", async (_event, payload) => {
      return await this.requestDesktopWorker("set_active_provider", payload);
    });
    ipcMain.handle("desktop:test-provider", async (_event, payload) => {
      return await this.requestDesktopWorker("test_provider", payload);
    });
    ipcMain.handle("desktop:glossary-list", async () => {
      return await this.requestDesktopWorker("glossary_list", {});
    });
    ipcMain.handle("desktop:glossary-add", async (_event, payload) => {
      return await this.requestDesktopWorker("glossary_add", payload);
    });
    ipcMain.handle("desktop:glossary-delete", async (_event, payload) => {
      return await this.requestDesktopWorker("glossary_delete", payload);
    });
    ipcMain.handle("desktop:update-yt-dlp", async () => {
      return await this.requestDesktopWorker("update_yt_dlp", {});
    });
    ipcMain.handle("desktop:analyze-url", async (_event, payload) => {
      return await this.requestDesktopWorker("analyze_url", payload);
    });
    ipcMain.handle("desktop:save-cookies", async (_event, payload) => {
      return await this.requestDesktopWorker("save_cookies", payload);
    });
    ipcMain.handle("desktop:download", async (_event, payload) => {
      return await this.requestDesktopWorker("download", payload);
    });
    ipcMain.handle("desktop:extract", async (_event, payload) => {
      return await this.requestDesktopWorker("extract", payload);
    });
    ipcMain.handle("desktop:get-ocr-results", async (_event, payload) => {
      return await this.requestDesktopWorker("get_ocr_results", payload);
    });
    ipcMain.handle("desktop:detect-silence", async (_event, payload) => {
      return await this.requestDesktopWorker("detect_silence", payload);
    });
    ipcMain.handle("desktop:transcribe-segment", async (_event, payload) => {
      return await this.requestDesktopWorker("transcribe_segment", payload);
    });
    ipcMain.handle("desktop:translate-segment", async (_event, payload) => {
      return await this.requestDesktopWorker("translate_segment", payload);
    });
    ipcMain.handle("desktop:upload-watermark", async (_event, payload) => {
      return await this.requestDesktopWorker("upload_watermark", payload);
    });
    ipcMain.handle("desktop:get-latest-watermark", async () => {
      return await this.requestDesktopWorker("get_latest_watermark", {});
    });
    ipcMain.handle("desktop:enhance", async (_event, payload) => {
      return await this.requestDesktopWorker("enhance", payload);
    });
    ipcMain.handle("desktop:clean", async (_event, payload) => {
      return await this.requestDesktopWorker("clean", payload);
    });
    ipcMain.handle("desktop:pause-task", async (_event, payload) => {
      return await this.pauseDesktopWorkerTask(String(payload.task_id));
    });
    ipcMain.handle("desktop:resume-task", async (_event, payload) => {
      return await this.resumeDesktopWorkerTask(String(payload.task_id));
    });
    ipcMain.handle("desktop:cancel-task", async (_event, payload) => {
      return await this.cancelDesktopWorkerTask(String(payload.task_id));
    });
  }

  stop() {
    this.stopDesktopWorker();
  }

  private listTasks() {
    this.historyStore.ensureLoaded();
    return getDesktopTaskSnapshot({
      activeTaskId: this.activeDesktopWorkerTaskId,
      queuedTaskIds: this.queuedDesktopWorkerTaskIds,
      pausedTasks: this.pausedDesktopWorkerTasks,
      requests: this.desktopWorkerRequests,
      historyTasks: this.historyStore.list(),
    });
  }

  private emitDesktopTaskMessage(message: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("desktop:task-event", message);
    }
  }

  private emitDesktopProgress(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
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
    const isDev = isDesktopDevMode();

    if (!isDev && app.isPackaged) {
      const backendExe = resolveBundledBackendExecutable();
      if (!fs.existsSync(backendExe)) {
        console.error("Bundled backend worker executable not found at:", backendExe);
        return null;
      }

      return {
        command: backendExe,
        args: ["--desktop-worker"],
        cwd: path.dirname(backendExe),
      };
    }

    const runPyPath = path.resolve(app.getAppPath(), "..", "run.py");
    return {
      command: "python",
      args: [runPyPath, "--desktop-worker"],
      cwd: path.dirname(runPyPath),
    };
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
        if (message.event === "progress") {
          console.log("[DesktopWorker progress]", message.payload);
          this.emitDesktopProgress("desktop:transcribe-progress", message.payload);
        } else if (message.event === "translate_progress") {
          console.log("[DesktopWorker translate progress]", message.payload);
          this.emitDesktopProgress("desktop:translate-progress", message.payload);
        } else if (message.event === "synthesize_progress") {
          console.log("[DesktopWorker synthesize progress]", message.payload);
          this.emitDesktopProgress("desktop:synthesize-progress", message.payload);
        } else if (message.event === "extract_progress") {
          console.log("[DesktopWorker extract progress]", message.payload);
        } else if (message.event === "download_progress") {
          console.log("[DesktopWorker download progress]", message.payload);
        } else if (message.event === "enhance_progress") {
          console.log("[DesktopWorker enhance progress]", message.payload);
        } else if (message.event === "clean_progress") {
          console.log("[DesktopWorker clean progress]", message.payload);
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
      for (const { reject } of this.desktopWorkerRequests.values()) {
        reject(new Error("Desktop worker exited"));
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

  private requestDesktopWorker<T = unknown>(command: string, payload: Record<string, unknown>) {
    this.startDesktopWorker();

    return this.waitForDesktopWorkerReady().then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (!this.desktopWorkerProcess?.stdin?.writable) {
            reject(new Error("Desktop worker stdin is not writable"));
            return;
          }

          const requestedTaskId =
            typeof payload.task_id === "string" && payload.task_id.trim().length > 0
              ? payload.task_id
              : `worker-${Date.now()}-${++this.desktopWorkerId}`;
          const id = requestedTaskId;
          this.historyStore.remove(id);
          this.desktopWorkerRequests.set(id, { command, payload, resolve, reject });
          if (isTrackedDesktopCommand(command)) {
            this.queuedDesktopWorkerTaskIds.push(id);
            this.emitDesktopTaskMessage({
              type: "update",
              task: {
                ...buildDesktopTask(id, command, payload, "pending", 0, "Queued"),
                queue_position: this.queuedDesktopWorkerTaskIds.length,
              },
            });
            this.dispatchNextDesktopWorkerTask();
            return;
          }
          try {
            this.desktopWorkerProcess.stdin.write(`${JSON.stringify({ id, command, payload })}\n`);
          } catch (error) {
            this.desktopWorkerRequests.delete(id);
            reject(error);
          }
        }),
    );
  }

  private async pauseDesktopWorkerTask(taskId: string) {
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

  private async resumeDesktopWorkerTask(taskId: string) {
    const plan = planResumeDesktopTask(taskId, this.pausedDesktopWorkerTasks);
    if (plan.status === "ignored" || !plan.resumeTask) {
      return { status: "ignored" };
    }

    if (plan.removePaused) {
      this.pausedDesktopWorkerTasks.delete(taskId);
    }
    void this.requestDesktopWorker(plan.resumeTask.command, plan.resumeTask.payload).catch((error) => {
      console.error(`[DesktopWorker] Failed to resume ${taskId}:`, error);
    });
    return { status: plan.status };
  }

  private async cancelDesktopWorkerTask(taskId: string) {
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
}

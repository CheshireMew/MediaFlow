/// <reference types="node" />
import { app, BrowserWindow, Menu, shell, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import type { Task } from "../src/types/task";
import {
  normalizePersistedDesktopTaskHistory,
  parsePersistedDesktopTaskHistory,
  serializePersistedDesktopTaskHistory,
} from "./desktopTaskPersistence";
import {
  buildDesktopTaskProgressUpdate,
  buildDesktopTaskResponseUpdate,
  buildDesktopTask,
  getDesktopTaskSnapshot,
  isTrackedDesktopCommand,
  planCancelDesktopTask,
  planPauseDesktopTask,
  planResumeDesktopTask,
  type DesktopTaskType,
} from "./desktopTaskState";
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  DESKTOP_TASK_OWNER_MODE,
  DESKTOP_WORKER_PROTOCOL_VERSION,
} from "../src/contracts/runtimeContracts";

let backendProcess: ChildProcess | null = null;
let desktopWorkerProcess: ChildProcess | null = null;
let desktopWorkerReady = false;
let desktopWorkerId = 0;
let desktopWorkerStdoutBuffer = "";
let desktopWorkerReadyWaiters: Array<() => void> = [];
let activeDesktopWorkerTaskId: string | null = null;
let desktopWorkerStopMode: "restart" | "shutdown" | null = null;
let desktopTaskHistoryLoaded = false;
const queuedDesktopWorkerTaskIds: string[] = [];
let desktopTaskHistory: Task[] = [];
const pausedDesktopWorkerTasks = new Map<
  string,
  {
    command: DesktopTaskType;
    payload: Record<string, unknown>;
  }
>();
const desktopWorkerRequests = new Map<
  string,
  {
    command: string;
    payload: Record<string, unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();
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
  "getDesktopPeaks",
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

function getDesktopTaskHistoryPath() {
  return path.join(app.getPath("userData"), "desktop-task-history.json");
}

function ensureDesktopTaskHistoryLoaded() {
  if (desktopTaskHistoryLoaded) {
    return;
  }

  desktopTaskHistoryLoaded = true;
  try {
    const historyPath = getDesktopTaskHistoryPath();
    if (!fs.existsSync(historyPath)) {
      desktopTaskHistory = [];
      return;
    }

    const raw = fs.readFileSync(historyPath, "utf-8");
    desktopTaskHistory = parsePersistedDesktopTaskHistory(raw);
  } catch (error) {
    console.error("[DesktopWorker] Failed to load persisted task history", error);
    desktopTaskHistory = [];
  }
}

function saveDesktopTaskHistory() {
  ensureDesktopTaskHistoryLoaded();

  try {
    const historyPath = getDesktopTaskHistoryPath();
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(historyPath, serializePersistedDesktopTaskHistory(desktopTaskHistory), "utf-8");
  } catch (error) {
    console.error("[DesktopWorker] Failed to save task history", error);
  }
}

function upsertDesktopTaskHistory(task: Task) {
  ensureDesktopTaskHistoryLoaded();
  desktopTaskHistory = normalizePersistedDesktopTaskHistory([
    task,
    ...desktopTaskHistory.filter((existingTask) => existingTask.id !== task.id),
  ]);
  saveDesktopTaskHistory();
}

function removeDesktopTaskHistory(taskId: string) {
  ensureDesktopTaskHistoryLoaded();
  const nextHistory = desktopTaskHistory.filter((task) => task.id !== taskId);
  if (nextHistory.length === desktopTaskHistory.length) {
    return false;
  }

  desktopTaskHistory = nextHistory;
  saveDesktopTaskHistory();
  return true;
}

function emitDesktopTaskMessage(message: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop:task-event", message);
  }
}

function syncQueuedDesktopWorkerTasks() {
  queuedDesktopWorkerTaskIds.forEach((taskId, index) => {
    const pending = desktopWorkerRequests.get(taskId);
    if (!pending || !isTrackedDesktopCommand(pending.command)) {
      return;
    }

    emitDesktopTaskMessage({
      type: "update",
      task: {
        ...buildDesktopTask(taskId, pending.command, pending.payload, "pending", 0, "Queued"),
        queue_position: index + 1,
      },
    });
  });
}

function removeQueuedDesktopWorkerTask(taskId: string) {
  const index = queuedDesktopWorkerTaskIds.indexOf(taskId);
  if (index === -1) {
    return false;
  }

  queuedDesktopWorkerTaskIds.splice(index, 1);
  syncQueuedDesktopWorkerTasks();
  return true;
}

function dispatchNextDesktopWorkerTask() {
  if (!desktopWorkerReady || activeDesktopWorkerTaskId || !desktopWorkerProcess?.stdin?.writable) {
    return;
  }

  const nextTaskId = queuedDesktopWorkerTaskIds.shift();
  if (!nextTaskId) {
    return;
  }

  const pending = desktopWorkerRequests.get(nextTaskId);
  if (!pending) {
    syncQueuedDesktopWorkerTasks();
    dispatchNextDesktopWorkerTask();
    return;
  }

  activeDesktopWorkerTaskId = nextTaskId;
  if (isTrackedDesktopCommand(pending.command)) {
    emitDesktopTaskMessage({
      type: "update",
      task: {
        ...buildDesktopTask(nextTaskId, pending.command, pending.payload, "running", 0, "Starting"),
        queue_position: null,
      },
    });
  }
  syncQueuedDesktopWorkerTasks();
  try {
    desktopWorkerProcess.stdin.write(
      `${JSON.stringify({ id: nextTaskId, command: pending.command, payload: pending.payload })}\n`,
    );
  } catch (error) {
    desktopWorkerRequests.delete(nextTaskId);
    activeDesktopWorkerTaskId = null;
    const taskUpdate = buildDesktopTaskResponseUpdate({
      taskId: nextTaskId,
      request: pending,
      ok: false,
      error: error instanceof Error ? error.message : "Desktop worker request failed",
    });
    if (taskUpdate) {
      upsertDesktopTaskHistory(taskUpdate);
      emitDesktopTaskMessage({
        type: "update",
        task: taskUpdate,
      });
    }
    pending.reject(error);
    dispatchNextDesktopWorkerTask();
  }
}


function startBackend() {
  const isDev = process.env.IS_DEV === "true";
  
  // Only spawn the bundled backend in production
  if (!isDev && app.isPackaged) {
    // In production, extraResources are placed in process.resourcesPath
    const backendExe = path.join(process.resourcesPath, "backend", "mediaflow-backend.exe");
    
    if (fs.existsSync(backendExe)) {
      console.log("Starting bundled backend:", backendExe);
      backendProcess = spawn(backendExe, [], {
        cwd: path.dirname(backendExe),
        detached: false,
      });

      backendProcess.stdout?.on('data', (data) => console.log(`[Backend] ${data}`));
      backendProcess.stderr?.on('data', (data) => console.error(`[Backend ERR] ${data}`));
      backendProcess.on('close', (code) => console.log(`[Backend] exited with code ${code}`));
    } else {
      console.error("Bundled backend not found at:", backendExe);
    }
  }
}

function getDesktopWorkerCommand(): { command: string; args: string[]; cwd: string } | null {
  const isDev = process.env.IS_DEV === "true";

  if (!isDev && app.isPackaged) {
    const backendExe = path.join(process.resourcesPath, "backend", "mediaflow-backend.exe");
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

function resolveDesktopWorkerReady() {
  desktopWorkerReady = true;
  const waiters = [...desktopWorkerReadyWaiters];
  desktopWorkerReadyWaiters = [];
  waiters.forEach((waiter) => waiter());
}

function handleDesktopWorkerLine(line: string) {
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
      resolveDesktopWorkerReady();
      dispatchNextDesktopWorkerTask();
      return;
    }

    if (message.type === "event") {
      if (message.event === "progress") {
        console.log("[DesktopWorker progress]", message.payload);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("desktop:transcribe-progress", message.payload);
        }
      } else if (message.event === "extract_progress") {
        console.log("[DesktopWorker extract progress]", message.payload);
      } else if (message.event === "download_progress") {
        console.log("[DesktopWorker download progress]", message.payload);
      } else if (message.event === "translate_progress") {
        console.log("[DesktopWorker translate progress]", message.payload);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("desktop:translate-progress", message.payload);
        }
      } else if (message.event === "synthesize_progress") {
        console.log("[DesktopWorker synthesize progress]", message.payload);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("desktop:synthesize-progress", message.payload);
        }
      } else if (message.event === "enhance_progress") {
        console.log("[DesktopWorker enhance progress]", message.payload);
      } else if (message.event === "clean_progress") {
        console.log("[DesktopWorker clean progress]", message.payload);
      }

      if (message.id) {
        const pending = desktopWorkerRequests.get(message.id);
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
            emitDesktopTaskMessage({
              type: "update",
              task: taskUpdate,
            });
          }
        }
      }
      return;
    }

    if (message.type === "response" && message.id) {
      const pending = desktopWorkerRequests.get(message.id);
      if (!pending) {
        return;
      }

      desktopWorkerRequests.delete(message.id);
      if (activeDesktopWorkerTaskId === message.id) {
        activeDesktopWorkerTaskId = null;
        dispatchNextDesktopWorkerTask();
      }
      if (message.ok) {
        const taskUpdate = buildDesktopTaskResponseUpdate({
          taskId: message.id,
          request: pending,
          ok: true,
          result: message.result,
        });
        if (taskUpdate) {
          upsertDesktopTaskHistory(taskUpdate);
          emitDesktopTaskMessage({
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
          upsertDesktopTaskHistory(taskUpdate);
          emitDesktopTaskMessage({
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

function startDesktopWorker() {
  if (desktopWorkerProcess && desktopWorkerProcess.exitCode === null) {
    return;
  }

  const workerCommand = getDesktopWorkerCommand();
  if (!workerCommand) {
    return;
  }

  desktopWorkerReady = false;
  desktopWorkerStdoutBuffer = "";
  console.log("Starting desktop worker:", workerCommand.command, workerCommand.args.join(" "));
  desktopWorkerProcess = spawn(workerCommand.command, workerCommand.args, {
    cwd: workerCommand.cwd,
    detached: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  desktopWorkerProcess.stdout?.on("data", (data) => {
    desktopWorkerStdoutBuffer += data.toString();
    let newlineIndex = desktopWorkerStdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = desktopWorkerStdoutBuffer.slice(0, newlineIndex).trim();
      desktopWorkerStdoutBuffer = desktopWorkerStdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        handleDesktopWorkerLine(line);
      }
      newlineIndex = desktopWorkerStdoutBuffer.indexOf("\n");
    }
  });

  desktopWorkerProcess.stderr?.on("data", (data) => {
    console.error(`[DesktopWorker ERR] ${data}`);
  });

  desktopWorkerProcess.on("close", (code) => {
    console.log(`[DesktopWorker] exited with code ${code}`);
    desktopWorkerReady = false;
    desktopWorkerProcess = null;
    activeDesktopWorkerTaskId = null;

    const stopMode = desktopWorkerStopMode;
    desktopWorkerStopMode = null;

    if (stopMode === "restart") {
      const queuedTaskIdSet = new Set(queuedDesktopWorkerTaskIds);
      for (const [requestId, pending] of [...desktopWorkerRequests.entries()]) {
        if (queuedTaskIdSet.has(requestId)) {
          continue;
        }
        pending.reject(new Error("Desktop worker restarted"));
        desktopWorkerRequests.delete(requestId);
      }
      desktopWorkerReadyWaiters = [];
      if (desktopWorkerRequests.size > 0 || queuedDesktopWorkerTaskIds.length > 0) {
        startDesktopWorker();
      }
      return;
    }

    queuedDesktopWorkerTaskIds.length = 0;
    for (const { reject } of desktopWorkerRequests.values()) {
      reject(new Error("Desktop worker exited"));
    }
    desktopWorkerRequests.clear();
    desktopWorkerReadyWaiters = [];
  });
}

function stopDesktopWorker(mode: "restart" | "shutdown" = "shutdown") {
  desktopWorkerStopMode = mode;
  if (desktopWorkerProcess && desktopWorkerProcess.pid) {
    try {
      console.log(`Killing desktop worker process ${desktopWorkerProcess.pid}`);
      process.kill(desktopWorkerProcess.pid, "SIGTERM");
    } catch (e) {
      console.error("Failed to kill desktop worker:", e);
    }
    desktopWorkerProcess = null;
  } else if (mode === "restart" && (desktopWorkerRequests.size > 0 || queuedDesktopWorkerTaskIds.length > 0)) {
    desktopWorkerStopMode = null;
    startDesktopWorker();
  }
  desktopWorkerReady = false;
  activeDesktopWorkerTaskId = null;
}

function waitForDesktopWorkerReady(timeoutMs = 15000): Promise<void> {
  if (desktopWorkerReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      desktopWorkerReadyWaiters = desktopWorkerReadyWaiters.filter((waiter) => waiter !== onReady);
      reject(new Error("Desktop worker startup timed out"));
    }, timeoutMs);

    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };

    desktopWorkerReadyWaiters.push(onReady);
  });
}

function requestDesktopWorker<T = unknown>(command: string, payload: Record<string, unknown>) {
  startDesktopWorker();

  return waitForDesktopWorkerReady().then(
    () =>
      new Promise<T>((resolve, reject) => {
        if (!desktopWorkerProcess?.stdin?.writable) {
          reject(new Error("Desktop worker stdin is not writable"));
          return;
        }

        const requestedTaskId =
          typeof payload.task_id === "string" && payload.task_id.trim().length > 0
            ? payload.task_id
            : `worker-${Date.now()}-${++desktopWorkerId}`;
        const id = requestedTaskId;
        removeDesktopTaskHistory(id);
        desktopWorkerRequests.set(id, { command, payload, resolve, reject });
        if (isTrackedDesktopCommand(command)) {
          queuedDesktopWorkerTaskIds.push(id);
          emitDesktopTaskMessage({
            type: "update",
            task: {
              ...buildDesktopTask(id, command, payload, "pending", 0, "Queued"),
              queue_position: queuedDesktopWorkerTaskIds.length,
            },
          });
          dispatchNextDesktopWorkerTask();
          return;
        }
        try {
          desktopWorkerProcess.stdin.write(
            `${JSON.stringify({ id, command, payload })}\n`,
          );
        } catch (error) {
          desktopWorkerRequests.delete(id);
          reject(error);
        }
      }),
  );
}

async function pauseDesktopWorkerTask(taskId: string) {
  const plan = planPauseDesktopTask(taskId, {
    activeTaskId: activeDesktopWorkerTaskId,
    queuedTaskIds: queuedDesktopWorkerTaskIds,
    pausedTasks: pausedDesktopWorkerTasks,
    requests: desktopWorkerRequests,
  });
  if (plan.status === "ignored") {
    return { status: "ignored" };
  }

  const pending = desktopWorkerRequests.get(taskId);
  if (!pending) {
    return { status: "ignored" };
  }

  if (plan.removeRequest) {
    desktopWorkerRequests.delete(taskId);
  }
  if (plan.removeQueued) {
    removeQueuedDesktopWorkerTask(taskId);
  }
  if (plan.addPausedTask) {
    pausedDesktopWorkerTasks.set(taskId, plan.addPausedTask);
  }
  if (plan.emitTask) {
    emitDesktopTaskMessage({ type: "update", task: plan.emitTask });
  }
  if (plan.rejectMessage) {
    pending.reject(new Error(plan.rejectMessage));
  }
  if (plan.shouldRestartWorker) {
    stopDesktopWorker("restart");
  }

  return { status: plan.status };
}

async function resumeDesktopWorkerTask(taskId: string) {
  const plan = planResumeDesktopTask(taskId, pausedDesktopWorkerTasks);
  if (plan.status === "ignored" || !plan.resumeTask) {
    return { status: "ignored" };
  }

  if (plan.removePaused) {
    pausedDesktopWorkerTasks.delete(taskId);
  }
  void requestDesktopWorker(plan.resumeTask.command, plan.resumeTask.payload).catch((error) => {
    console.error(`[DesktopWorker] Failed to resume ${taskId}:`, error);
  });
  return { status: plan.status };
}

async function cancelDesktopWorkerTask(taskId: string) {
  if (removeDesktopTaskHistory(taskId)) {
    emitDesktopTaskMessage({ type: "delete", task_id: taskId });
    return { status: "removed" };
  }

  const plan = planCancelDesktopTask(taskId, {
    activeTaskId: activeDesktopWorkerTaskId,
    queuedTaskIds: queuedDesktopWorkerTaskIds,
    pausedTasks: pausedDesktopWorkerTasks,
    requests: desktopWorkerRequests,
  });
  if (plan.status === "ignored") {
    return { status: "ignored" };
  }

  const pending = desktopWorkerRequests.get(taskId);

  if (plan.removePaused) {
    pausedDesktopWorkerTasks.delete(taskId);
  }
  if (plan.removeRequest) {
    desktopWorkerRequests.delete(taskId);
  }
  if (plan.removeQueued) {
    removeQueuedDesktopWorkerTask(taskId);
  }
  if (plan.emitDelete) {
    emitDesktopTaskMessage({ type: "delete", task_id: taskId });
  }
  if (plan.emitTask) {
    emitDesktopTaskMessage({ type: "update", task: plan.emitTask });
  }
  if (pending && plan.rejectMessage) {
    pending.reject(new Error(plan.rejectMessage));
  }
  if (plan.shouldRestartWorker) {
    stopDesktopWorker("restart");
  }
  return { status: plan.status };
}

function killBackend() {
  if (backendProcess && backendProcess.pid) {
    try {
      console.log(`Killing backend process ${backendProcess.pid}`);
      process.kill(backendProcess.pid, 'SIGTERM');
    } catch(e) {
      console.error("Failed to kill backend:", e);
    }
    backendProcess = null;
  }
}

// ─── IPC Handler Registration ───────────────────────────────────
// Each module exports a register function that sets up its IPC handlers.
// This keeps main.ts focused on window creation and app lifecycle.
import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";
registerDialogHandlers();
registerWindowHandlers();
registerCookieHandlers();
ipcMain.handle("desktop:transcribe", async (_event, payload) => {
  return await requestDesktopWorker("transcribe", payload);
});
ipcMain.handle("desktop:get-runtime-info", async () => {
  const ping = await requestDesktopWorker<{
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
  return await requestDesktopWorker("ping", {});
});
ipcMain.handle("desktop:list-tasks", async () => {
  ensureDesktopTaskHistoryLoaded();
  return getDesktopTaskSnapshot({
    activeTaskId: activeDesktopWorkerTaskId,
    queuedTaskIds: queuedDesktopWorkerTaskIds,
    pausedTasks: pausedDesktopWorkerTasks,
    requests: desktopWorkerRequests,
    historyTasks: desktopTaskHistory,
  });
});
ipcMain.handle("desktop:translate", async (_event, payload) => {
  return await requestDesktopWorker("translate", payload);
});
ipcMain.handle("desktop:synthesize", async (_event, payload) => {
  return await requestDesktopWorker("synthesize", payload);
});
ipcMain.handle("desktop:get-settings", async () => {
  return await requestDesktopWorker("get_settings", {});
});
ipcMain.handle("desktop:update-settings", async (_event, payload) => {
  return await requestDesktopWorker("update_settings", payload);
});
ipcMain.handle("desktop:set-active-provider", async (_event, payload) => {
  return await requestDesktopWorker("set_active_provider", payload);
});
ipcMain.handle("desktop:test-provider", async (_event, payload) => {
  return await requestDesktopWorker("test_provider", payload);
});
ipcMain.handle("desktop:glossary-list", async () => {
  return await requestDesktopWorker("glossary_list", {});
});
ipcMain.handle("desktop:glossary-add", async (_event, payload) => {
  return await requestDesktopWorker("glossary_add", payload);
});
ipcMain.handle("desktop:glossary-delete", async (_event, payload) => {
  return await requestDesktopWorker("glossary_delete", payload);
});
ipcMain.handle("desktop:update-yt-dlp", async () => {
  return await requestDesktopWorker("update_yt_dlp", {});
});
ipcMain.handle("desktop:analyze-url", async (_event, payload) => {
  return await requestDesktopWorker("analyze_url", payload);
});
ipcMain.handle("desktop:save-cookies", async (_event, payload) => {
  return await requestDesktopWorker("save_cookies", payload);
});
ipcMain.handle("desktop:download", async (_event, payload) => {
  return await requestDesktopWorker("download", payload);
});
ipcMain.handle("desktop:extract", async (_event, payload) => {
  return await requestDesktopWorker("extract", payload);
});
ipcMain.handle("desktop:get-ocr-results", async (_event, payload) => {
  return await requestDesktopWorker("get_ocr_results", payload);
});
ipcMain.handle("desktop:detect-silence", async (_event, payload) => {
  return await requestDesktopWorker("detect_silence", payload);
});
ipcMain.handle("desktop:get-peaks", async (_event, payload) => {
  const result = await requestDesktopWorker<{ peaks_path?: string }>("get_peaks", payload);
  const peaksPath = result?.peaks_path;
  if (!peaksPath || !fs.existsSync(peaksPath)) {
    throw new Error("Desktop peaks file is unavailable.");
  }
  return fs.readFileSync(peaksPath);
});
ipcMain.handle("desktop:transcribe-segment", async (_event, payload) => {
  return await requestDesktopWorker("transcribe_segment", payload);
});
ipcMain.handle("desktop:translate-segment", async (_event, payload) => {
  return await requestDesktopWorker("translate_segment", payload);
});
ipcMain.handle("desktop:upload-watermark", async (_event, payload) => {
  return await requestDesktopWorker("upload_watermark", payload);
});
ipcMain.handle("desktop:get-latest-watermark", async () => {
  return await requestDesktopWorker("get_latest_watermark", {});
});
ipcMain.handle("desktop:enhance", async (_event, payload) => {
  return await requestDesktopWorker("enhance", payload);
});
ipcMain.handle("desktop:clean", async (_event, payload) => {
  return await requestDesktopWorker("clean", payload);
});
ipcMain.handle("desktop:pause-task", async (_event, payload) => {
  return await pauseDesktopWorkerTask(String(payload.task_id));
});
ipcMain.handle("desktop:resume-task", async (_event, payload) => {
  return await resumeDesktopWorkerTask(String(payload.task_id));
});
ipcMain.handle("desktop:cancel-task", async (_event, payload) => {
  return await cancelDesktopWorkerTask(String(payload.task_id));
});

// ─── Main Window ────────────────────────────────────────────────
function createWindow() {
  // Check if we are in dev mode
  const isDev = process.env.IS_DEV === "true";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#1a1b1e",
    frame: false, // Custom frame
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !isDev, // Disable only in Dev for localhost CORS
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Application Menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open API Docs",
          click: async () => {
            await shell.openExternal("http://localhost:8800/docs");
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── App Lifecycle ──────────────────────────────────────────────
app.on("ready", () => {
  startBackend();
  createWindow();
});

app.on("before-quit", () => {
  killBackend();
  stopDesktopWorker();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

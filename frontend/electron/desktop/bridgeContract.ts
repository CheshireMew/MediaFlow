import desktopWorkerContract from "../../../contracts/desktop-worker-contract.json";

export const DESKTOP_TASK_EVENT_CHANNEL = "desktop:task-event";
export const DESKTOP_WORKER_PROGRESS_CHANNEL = "desktop:worker-progress";

export const DESKTOP_WORKER_PROTOCOL_VERSION = desktopWorkerContract.protocol_version;
export const DESKTOP_WORKER_INVOCATIONS = desktopWorkerContract.invocations;

export const DESKTOP_BRIDGE_CAPABILITIES = [
  "openFile",
  "openSubtitleFile",
  "readFile",
  "showSaveDialog",
  "selectDirectory",
  "showInExplorer",
  "fetchCookies",
  "getPathForFile",
  "writeFile",
  "getFileSize",
  "resolveExistingPath",
  "getDesktopRuntimeInfo",
  "listDesktopTasks",
  ...Object.keys(DESKTOP_WORKER_INVOCATIONS),
  "pauseDesktopTask",
  "resumeDesktopTask",
  "cancelDesktopTask",
  "onDesktopTaskEvent",
  "onDesktopProgress",
  "minimize",
  "maximize",
  "close",
  "notifyRendererReady",
] as const;

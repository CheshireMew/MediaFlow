import desktopWorkerContract from "../../../contracts/desktop-worker-contract.json";

export const DESKTOP_TASK_EVENT_CHANNEL = "desktop:task-event";

export const DESKTOP_PROGRESS_CHANNELS = {
  onDesktopTranscribeProgress: "desktop:transcribe-progress",
  onDesktopTranslateProgress: "desktop:translate-progress",
  onDesktopSynthesizeProgress: "desktop:synthesize-progress",
  onDesktopSettingsProgress: "desktop:settings-progress",
} as const;

export const DESKTOP_WORKER_EVENT_CHANNELS = {
  progress: DESKTOP_PROGRESS_CHANNELS.onDesktopTranscribeProgress,
  translate_progress: DESKTOP_PROGRESS_CHANNELS.onDesktopTranslateProgress,
  synthesize_progress: DESKTOP_PROGRESS_CHANNELS.onDesktopSynthesizeProgress,
  settings_progress: DESKTOP_PROGRESS_CHANNELS.onDesktopSettingsProgress,
} as const;

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
  ...Object.keys(DESKTOP_PROGRESS_CHANNELS),
  "minimize",
  "maximize",
  "close",
  "notifyRendererReady",
] as const;

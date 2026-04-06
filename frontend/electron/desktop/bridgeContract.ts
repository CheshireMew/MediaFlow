export const DESKTOP_TASK_EVENT_CHANNEL = "desktop:task-event";

export const DESKTOP_PROGRESS_CHANNELS = {
  onDesktopTranscribeProgress: "desktop:transcribe-progress",
  onDesktopTranslateProgress: "desktop:translate-progress",
  onDesktopSynthesizeProgress: "desktop:synthesize-progress",
} as const;

export const DESKTOP_WORKER_EVENT_CHANNELS = {
  progress: DESKTOP_PROGRESS_CHANNELS.onDesktopTranscribeProgress,
  translate_progress: DESKTOP_PROGRESS_CHANNELS.onDesktopTranslateProgress,
  synthesize_progress: DESKTOP_PROGRESS_CHANNELS.onDesktopSynthesizeProgress,
} as const;

export const DESKTOP_WORKER_INVOCATIONS = {
  desktopPing: {
    ipcChannel: "desktop:ping",
    workerCommand: "ping",
  },
  desktopTranscribe: {
    ipcChannel: "desktop:transcribe",
    workerCommand: "transcribe",
  },
  desktopTranslate: {
    ipcChannel: "desktop:translate",
    workerCommand: "translate",
  },
  desktopSynthesize: {
    ipcChannel: "desktop:synthesize",
    workerCommand: "synthesize",
  },
  getDesktopSettings: {
    ipcChannel: "desktop:get-settings",
    workerCommand: "get_settings",
  },
  updateDesktopSettings: {
    ipcChannel: "desktop:update-settings",
    workerCommand: "update_settings",
  },
  setDesktopActiveProvider: {
    ipcChannel: "desktop:set-active-provider",
    workerCommand: "set_active_provider",
  },
  testDesktopProvider: {
    ipcChannel: "desktop:test-provider",
    workerCommand: "test_provider",
  },
  listDesktopGlossary: {
    ipcChannel: "desktop:glossary-list",
    workerCommand: "glossary_list",
  },
  addDesktopGlossaryTerm: {
    ipcChannel: "desktop:glossary-add",
    workerCommand: "glossary_add",
  },
  deleteDesktopGlossaryTerm: {
    ipcChannel: "desktop:glossary-delete",
    workerCommand: "glossary_delete",
  },
  updateDesktopYtDlp: {
    ipcChannel: "desktop:update-yt-dlp",
    workerCommand: "update_yt_dlp",
  },
  analyzeDesktopUrl: {
    ipcChannel: "desktop:analyze-url",
    workerCommand: "analyze_url",
  },
  saveDesktopCookies: {
    ipcChannel: "desktop:save-cookies",
    workerCommand: "save_cookies",
  },
  desktopDownload: {
    ipcChannel: "desktop:download",
    workerCommand: "download",
  },
  desktopExtract: {
    ipcChannel: "desktop:extract",
    workerCommand: "extract",
  },
  getDesktopOcrResults: {
    ipcChannel: "desktop:get-ocr-results",
    workerCommand: "get_ocr_results",
  },
  desktopTranscribeSegment: {
    ipcChannel: "desktop:transcribe-segment",
    workerCommand: "transcribe_segment",
  },
  desktopTranslateSegment: {
    ipcChannel: "desktop:translate-segment",
    workerCommand: "translate_segment",
  },
  uploadDesktopWatermark: {
    ipcChannel: "desktop:upload-watermark",
    workerCommand: "upload_watermark",
  },
  getDesktopLatestWatermark: {
    ipcChannel: "desktop:get-latest-watermark",
    workerCommand: "get_latest_watermark",
  },
  desktopEnhance: {
    ipcChannel: "desktop:enhance",
    workerCommand: "enhance",
  },
  desktopClean: {
    ipcChannel: "desktop:clean",
    workerCommand: "clean",
  },
} as const;

export const DESKTOP_BRIDGE_CAPABILITIES = [
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

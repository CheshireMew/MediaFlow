import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  sendMessage: (message: string) => ipcRenderer.send("message-from-ui", message),
  openFile: (defaultPath?: string) =>
    ipcRenderer.invoke("dialog:openFile", defaultPath),
  openSubtitleFile: () => ipcRenderer.invoke("dialog:openSubtitleFile"),
  readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
  showSaveDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) =>
    ipcRenderer.invoke("dialog:saveFile", options),
  selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),
  showInExplorer: (filePath: string) =>
    ipcRenderer.invoke("shell:showInExplorer", filePath),
  // Window Controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  notifyRendererReady: () => ipcRenderer.send("window:renderer-ready"),
  // Cookie management
  fetchCookies: (targetUrl: string) =>
    ipcRenderer.invoke("cookies:fetch", targetUrl),
  // Data extraction
  // Data extraction
  extractDouyinData: (url: string) => ipcRenderer.invoke("douyin:extract", url),
  // File Utils
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  readBinaryFile: (filePath: string) =>
    ipcRenderer.invoke("fs:readBinaryFile", filePath),
  writeBinaryFile: (filePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("fs:writeBinaryFile", filePath, data),
  getFileSize: (filePath: string) =>
    ipcRenderer.invoke("fs:getFileSize", filePath),
  resolveExistingPath: (filePath: string, fallbackName?: string, expectedSize?: number) =>
    ipcRenderer.invoke("fs:resolveExistingPath", filePath, fallbackName, expectedSize),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  getDesktopRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  desktopPing: () => ipcRenderer.invoke("desktop:ping"),
  listDesktopTasks: () => ipcRenderer.invoke("desktop:list-tasks"),
  desktopTranscribe: (payload: {
    audio_path?: string | null;
    audio_ref?: {
      path: string;
      name: string;
      size?: number;
      type?: string;
      media_id?: string;
      media_kind?: string;
      role?: string;
      origin?: string;
    } | null;
    engine?: "builtin" | "cli";
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }) => ipcRenderer.invoke("desktop:transcribe", payload),
  desktopTranslate: (payload: {
    segments: Array<{ id: string | number; start: number; end: number; text: string }>;
    target_language: string;
    mode: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
    context_ref?: {
      path: string;
      name: string;
      size?: number;
      type?: string;
      media_id?: string;
      media_kind?: string;
      role?: string;
      origin?: string;
    } | null;
  }) => ipcRenderer.invoke("desktop:translate", payload),
  desktopSynthesize: (payload: {
    task_id?: string;
    video_path: string;
    srt_path: string;
    watermark_path?: string | null;
    output_path?: string | null;
    options: Record<string, unknown>;
  }) => ipcRenderer.invoke("desktop:synthesize", payload),
  getDesktopSettings: () => ipcRenderer.invoke("desktop:get-settings"),
  updateDesktopSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke("desktop:update-settings", { settings }),
  setDesktopActiveProvider: (providerId: string) =>
    ipcRenderer.invoke("desktop:set-active-provider", { provider_id: providerId }),
  testDesktopProvider: (payload: {
    name?: string;
    base_url: string;
    api_key: string;
    model: string;
  }) => ipcRenderer.invoke("desktop:test-provider", payload),
  listDesktopGlossary: () => ipcRenderer.invoke("desktop:glossary-list"),
  addDesktopGlossaryTerm: (payload: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }) => ipcRenderer.invoke("desktop:glossary-add", payload),
  deleteDesktopGlossaryTerm: (termId: string) =>
    ipcRenderer.invoke("desktop:glossary-delete", { term_id: termId }),
  updateDesktopYtDlp: () => ipcRenderer.invoke("desktop:update-yt-dlp"),
  analyzeDesktopUrl: (url: string) => ipcRenderer.invoke("desktop:analyze-url", { url }),
  saveDesktopCookies: (domain: string, cookies: Array<Record<string, unknown>>) =>
    ipcRenderer.invoke("desktop:save-cookies", { domain, cookies }),
  desktopDownload: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke("desktop:download", payload),
  desktopExtract: (payload: {
    task_id?: string;
    video_path: string;
    roi?: number[];
    engine: "rapid" | "paddle";
    sample_rate?: number;
  }) => ipcRenderer.invoke("desktop:extract", payload),
  getDesktopOcrResults: (videoPath: string) =>
    ipcRenderer.invoke("desktop:get-ocr-results", { video_path: videoPath }),
  desktopTranscribeSegment: (payload: {
    audio_path: string;
    start: number;
    end: number;
    engine?: "builtin" | "cli";
    model?: string;
    device?: string;
    language?: string;
    initial_prompt?: string;
  }) => ipcRenderer.invoke("desktop:transcribe-segment", payload),
  desktopTranslateSegment: (payload: {
    segments: Array<{ id: string | number; start: number; end: number; text: string }>;
    target_language: string;
    mode?: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
  }) => ipcRenderer.invoke("desktop:translate-segment", payload),
  uploadDesktopWatermark: (filePath: string) =>
    ipcRenderer.invoke("desktop:upload-watermark", { file_path: filePath }),
  getDesktopLatestWatermark: () => ipcRenderer.invoke("desktop:get-latest-watermark"),
  desktopEnhance: (payload: {
    task_id?: string;
    video_path: string;
    model?: string;
    scale?: string;
    method?: string;
  }) => ipcRenderer.invoke("desktop:enhance", payload),
  desktopClean: (payload: {
    task_id?: string;
    video_path: string;
    roi: [number, number, number, number];
    method?: string;
  }) => ipcRenderer.invoke("desktop:clean", payload),
  pauseDesktopTask: (taskId: string) =>
    ipcRenderer.invoke("desktop:pause-task", { task_id: taskId }),
  resumeDesktopTask: (taskId: string) =>
    ipcRenderer.invoke("desktop:resume-task", { task_id: taskId }),
  cancelDesktopTask: (taskId: string) =>
    ipcRenderer.invoke("desktop:cancel-task", { task_id: taskId }),
  onDesktopTaskEvent: (
    callback: (payload: unknown) => void,
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload);

    ipcRenderer.on("desktop:task-event", listener);
    return () => {
      ipcRenderer.removeListener("desktop:task-event", listener);
    };
  },
  onDesktopTranscribeProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on("desktop:transcribe-progress", listener);
    return () => {
      ipcRenderer.removeListener("desktop:transcribe-progress", listener);
    };
  },
  onDesktopTranslateProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on("desktop:translate-progress", listener);
    return () => {
      ipcRenderer.removeListener("desktop:translate-progress", listener);
    };
  },
  onDesktopSynthesizeProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on("desktop:synthesize-progress", listener);
    return () => {
      ipcRenderer.removeListener("desktop:synthesize-progress", listener);
    };
  },
});

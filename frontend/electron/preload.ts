import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  DESKTOP_PROGRESS_CHANNELS,
  DESKTOP_TASK_EVENT_CHANNEL,
  DESKTOP_WORKER_INVOCATIONS,
} from "./desktop/bridgeContract";
import type { OpenFileDialogRequest } from "../src/contracts/openFileContract";

contextBridge.exposeInMainWorld("electronAPI", {
  sendMessage: (message: string) => ipcRenderer.send("message-from-ui", message),
  openFile: (request: OpenFileDialogRequest) =>
    ipcRenderer.invoke("dialog:openFile", request),
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
  desktopPing: () => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopPing.ipcChannel),
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
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopTranscribe.ipcChannel, payload),
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
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopTranslate.ipcChannel, payload),
  desktopSynthesize: (payload: {
    task_id?: string;
    video_path: string;
    srt_path: string;
    watermark_path?: string | null;
    output_path?: string | null;
    options: Record<string, unknown>;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopSynthesize.ipcChannel, payload),
  getDesktopSettings: () => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.getDesktopSettings.ipcChannel),
  updateDesktopSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.updateDesktopSettings.ipcChannel, { settings }),
  setDesktopActiveProvider: (providerId: string) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.setDesktopActiveProvider.ipcChannel, { provider_id: providerId }),
  testDesktopProvider: (payload: {
    name?: string;
    base_url: string;
    api_key: string;
    model: string;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.testDesktopProvider.ipcChannel, payload),
  listDesktopGlossary: () => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.listDesktopGlossary.ipcChannel),
  addDesktopGlossaryTerm: (payload: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.addDesktopGlossaryTerm.ipcChannel, payload),
  deleteDesktopGlossaryTerm: (termId: string) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.deleteDesktopGlossaryTerm.ipcChannel, { term_id: termId }),
  updateDesktopYtDlp: () => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.updateDesktopYtDlp.ipcChannel),
  analyzeDesktopUrl: (url: string) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.analyzeDesktopUrl.ipcChannel, { url }),
  saveDesktopCookies: (domain: string, cookies: Array<Record<string, unknown>>) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.saveDesktopCookies.ipcChannel, { domain, cookies }),
  desktopDownload: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopDownload.ipcChannel, payload),
  desktopExtract: (payload: {
    task_id?: string;
    video_path: string;
    roi?: number[];
    engine: "rapid" | "paddle";
    sample_rate?: number;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopExtract.ipcChannel, payload),
  getDesktopOcrResults: (videoPath: string) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.getDesktopOcrResults.ipcChannel, { video_path: videoPath }),
  desktopTranscribeSegment: (payload: {
    audio_path: string;
    start: number;
    end: number;
    engine?: "builtin" | "cli";
    model?: string;
    device?: string;
    language?: string;
    initial_prompt?: string;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopTranscribeSegment.ipcChannel, payload),
  desktopTranslateSegment: (payload: {
    segments: Array<{ id: string | number; start: number; end: number; text: string }>;
    target_language: string;
    mode?: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopTranslateSegment.ipcChannel, payload),
  uploadDesktopWatermark: (filePath: string) =>
    ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.uploadDesktopWatermark.ipcChannel, { file_path: filePath }),
  getDesktopLatestWatermark: () => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.getDesktopLatestWatermark.ipcChannel),
  desktopEnhance: (payload: {
    task_id?: string;
    video_path: string;
    model?: string;
    scale?: string;
    method?: string;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopEnhance.ipcChannel, payload),
  desktopClean: (payload: {
    task_id?: string;
    video_path: string;
    roi: [number, number, number, number];
    method?: string;
  }) => ipcRenderer.invoke(DESKTOP_WORKER_INVOCATIONS.desktopClean.ipcChannel, payload),
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

    ipcRenderer.on(DESKTOP_TASK_EVENT_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_TASK_EVENT_CHANNEL, listener);
    };
  },
  onDesktopTranscribeProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on(DESKTOP_PROGRESS_CHANNELS.onDesktopTranscribeProgress, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_PROGRESS_CHANNELS.onDesktopTranscribeProgress, listener);
    };
  },
  onDesktopTranslateProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on(DESKTOP_PROGRESS_CHANNELS.onDesktopTranslateProgress, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_PROGRESS_CHANNELS.onDesktopTranslateProgress, listener);
    };
  },
  onDesktopSynthesizeProgress: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { progress: number; message: string },
    ) => callback(payload);

    ipcRenderer.on(DESKTOP_PROGRESS_CHANNELS.onDesktopSynthesizeProgress, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_PROGRESS_CHANNELS.onDesktopSynthesizeProgress, listener);
    };
  },
});

import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  DESKTOP_FILE_SYSTEM_CHANNELS,
  type SaveFileDialogRequest,
  type SelectDirectoryRequest,
} from "../src/contracts/desktopFileSystemContract";
import type { OpenFileDialogRequest } from "../src/contracts/openFileContract";

let prepareToCloseListener: (() => boolean | Promise<boolean>) | null = null;

ipcRenderer.on("window:prepare-close", async (_event, requestId: string) => {
  try {
    const ready = prepareToCloseListener ? await prepareToCloseListener() : true;
    ipcRenderer.send("window:close-ready", requestId, ready, ready ? null : "Workspace persistence failed.");
  } catch (error) {
    ipcRenderer.send(
      "window:close-ready",
      requestId,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
});

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: (request: OpenFileDialogRequest) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.openFile, request),
  readFile: (filePath: string) => ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.readTextFile, filePath),
  showSaveDialog: (options: SaveFileDialogRequest) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.saveFileDialog, options),
  selectDirectory: (request?: SelectDirectoryRequest) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.selectDirectory, request),
  showInExplorer: (filePath: string) =>
    ipcRenderer.invoke("shell:showInExplorer", filePath),
  // Window Controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  notifyRendererReady: () => ipcRenderer.send("window:renderer-ready"),
  onPrepareToClose: (listener: () => boolean | Promise<boolean>) => {
    prepareToCloseListener = listener;
    return () => {
      if (prepareToCloseListener === listener) {
        prepareToCloseListener = null;
      }
    };
  },
  // Cookie management
  fetchCookies: (targetUrl: string) =>
    ipcRenderer.invoke("cookies:fetch", targetUrl),
  // File Utils
  getPathForFile: (file: File) => {
    const filePath = webUtils.getPathForFile(file);
    if (filePath) {
      const registered = ipcRenderer.sendSync(
        DESKTOP_FILE_SYSTEM_CHANNELS.rememberRendererFile,
        filePath,
      );
      if (!registered) {
        throw new Error("Selected file path could not be registered.");
      }
    }
    return filePath;
  },
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.writeTextFile, filePath, content),
  getFileSize: (filePath: string) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.getFileSize, filePath),
  readWorkspaceState: (sessionId: string) =>
    ipcRenderer.invoke(DESKTOP_FILE_SYSTEM_CHANNELS.readWorkspaceState, sessionId),
  writeWorkspaceState: (content: string, sessionId: string, revision: number) =>
    ipcRenderer.invoke(
      DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceState,
      content,
      sessionId,
      revision,
    ),
  getDesktopRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
});

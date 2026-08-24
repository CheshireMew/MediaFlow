/**
 * Window & Shell IPC Handlers
 *
 * Handles: shell:showInExplorer, window:minimize, window:maximize, window:close
 */
import { randomUUID } from "crypto";
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";

import { desktopFileAccess } from "./file-access";

const rendererReadyCallbacks = new Map<number, () => void>();
const rendererReadyContents = new Set<number>();
const closeAllowed = new WeakSet<BrowserWindow>();
const pendingCloseRequests = new Map<
  string,
  {
    webContentsId: number;
    resolve: (ready: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const closePromiseByWebContents = new Map<number, Promise<boolean>>();
const CLOSE_PREPARATION_TIMEOUT_MS = 15_000;

export function bindRendererReadyCallback(
  window: BrowserWindow,
  callback: () => void,
) {
  const webContentsId = window.webContents.id;
  rendererReadyCallbacks.set(webContentsId, callback);

  window.once("closed", () => {
    rendererReadyCallbacks.delete(webContentsId);
    rendererReadyContents.delete(webContentsId);
    closePromiseByWebContents.delete(webContentsId);
    for (const [requestId, request] of pendingCloseRequests) {
      if (request.webContentsId === webContentsId) {
        clearTimeout(request.timer);
        request.resolve(false);
        pendingCloseRequests.delete(requestId);
      }
    }
  });
}

async function requestRendererWorkspaceFlush(window: BrowserWindow) {
  const webContentsId = window.webContents.id;
  if (!rendererReadyContents.has(webContentsId)) {
    return true;
  }

  const existing = closePromiseByWebContents.get(webContentsId);
  if (existing) return await existing;

  const request = new Promise<boolean>((resolve) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      pendingCloseRequests.delete(requestId);
      console.error("[Desktop] Timed out while waiting for workspace persistence before close.");
      resolve(false);
    }, CLOSE_PREPARATION_TIMEOUT_MS);
    pendingCloseRequests.set(requestId, { webContentsId, resolve, timer });
    window.webContents.send("window:prepare-close", requestId);
  });
  closePromiseByWebContents.set(webContentsId, request);
  try {
    return await request;
  } finally {
    if (closePromiseByWebContents.get(webContentsId) === request) {
      closePromiseByWebContents.delete(webContentsId);
    }
  }
}

export async function requestGracefulWindowClose(window: BrowserWindow) {
  if (window.isDestroyed()) return true;
  const ready = await requestRendererWorkspaceFlush(window);
  if (!ready || window.isDestroyed()) return ready;
  closeAllowed.add(window);
  window.close();
  return true;
}

export function bindGracefulWindowClose(window: BrowserWindow) {
  window.on("close", (event) => {
    if (closeAllowed.has(window)) {
      closeAllowed.delete(window);
      return;
    }
    event.preventDefault();
    void requestGracefulWindowClose(window);
  });
}

export function registerWindowHandlers() {
  // Show file in system file explorer
  ipcMain.handle(
    "shell:showInExplorer",
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      if (filePath) {
        desktopFileAccess.assertRendererReadAccess(filePath, "Show in explorer");
        shell.showItemInFolder(filePath);
      }
    },
  );

  // Window minimize
  ipcMain.on("window:minimize", () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
  });

  // Window maximize / restore toggle
  ipcMain.on("window:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  // Window close
  ipcMain.on("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) void requestGracefulWindowClose(win);
  });

  ipcMain.on(
    "window:close-ready",
    (event, requestId: string, ready: boolean, error?: string | null) => {
      const request = pendingCloseRequests.get(requestId);
      if (!request || request.webContentsId !== event.sender.id) return;
      clearTimeout(request.timer);
      pendingCloseRequests.delete(requestId);
      if (!ready) {
        console.error(
          `[Desktop] Renderer rejected close because workspace persistence did not finish${
            error ? `: ${error}` : "."
          }`,
        );
      }
      request.resolve(Boolean(ready));
    },
  );

  ipcMain.on("window:renderer-ready", (event) => {
    rendererReadyContents.add(event.sender.id);
    const rendererReadyCallback = rendererReadyCallbacks.get(event.sender.id);
    if (rendererReadyCallback) {
      rendererReadyCallback();
      return;
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  });
}

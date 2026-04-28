/**
 * Window & Shell IPC Handlers
 *
 * Handles: shell:showInExplorer, window:minimize, window:maximize, window:close
 */
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";

import { desktopFileAccess } from "./file-access";

const rendererReadyCallbacks = new Map<number, () => void>();

export function bindRendererReadyCallback(
  window: BrowserWindow,
  callback: () => void,
) {
  const webContentsId = window.webContents.id;
  rendererReadyCallbacks.set(webContentsId, callback);

  window.once("closed", () => {
    rendererReadyCallbacks.delete(webContentsId);
  });
}

export function registerWindowHandlers() {
  // Show file in system file explorer
  ipcMain.handle(
    "shell:showInExplorer",
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      if (filePath) {
        desktopFileAccess.assertRendererFileSystemAccess(filePath, "Show in explorer");
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
  ipcMain.on("window:close", () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.close();
  });

  ipcMain.on("window:renderer-ready", (event) => {
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

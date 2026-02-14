/**
 * Window & Shell IPC Handlers
 *
 * Handles: shell:showInExplorer, window:minimize, window:maximize, window:close
 */
const { ipcMain, BrowserWindow, shell } = require("electron");

export function registerWindowHandlers() {
  // Show file in system file explorer
  ipcMain.handle(
    "shell:showInExplorer",
    async (_event: any, filePath: string) => {
      if (filePath) {
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
}

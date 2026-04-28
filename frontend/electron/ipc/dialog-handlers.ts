import { app, dialog, ipcMain } from "electron";
import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
} from "electron";
import fs from "fs";
import path from "path";

import {
  DESKTOP_FILE_SYSTEM_CHANNELS,
  type SaveFileDialogRequest,
  type SelectDirectoryRequest,
} from "../../src/contracts/desktopFileSystemContract";
import {
  buildOpenFileDialogFilters,
  type OpenFileDialogRequest,
} from "../../src/contracts/openFileContract";
import { resolveDesktopWorkspaceDir } from "../desktopRuntime";
import { desktopFileAccess } from "./file-access";

function getStorePath() {
  return path.join(app.getPath("userData"), "user-preferences.json");
}

function loadLastOpenDir(): string | undefined {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, "utf-8")) as {
        lastOpenDir?: string;
      };
      return data.lastOpenDir;
    }
  } catch {
    // Preference corruption should not block the file picker.
  }
  return undefined;
}

function saveLastOpenDir(dirPath: string) {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ lastOpenDir: dirPath }));
  } catch (error) {
    console.error("Save preferences failed", error);
  }
}

let lastOpenDir: string | undefined;
let isLoaded = false;

function ensureLoaded() {
  if (!isLoaded) {
    lastOpenDir = loadLastOpenDir();
    isLoaded = true;
  }
}

function getDefaultStartPath(): string | undefined {
  const appPath = app.getAppPath();
  const workspaceDir = resolveDesktopWorkspaceDir();
  const startPath = lastOpenDir;

  if (!startPath) {
    return fs.existsSync(workspaceDir) ? workspaceDir : appPath;
  }
  if (!fs.existsSync(startPath)) {
    return fs.existsSync(workspaceDir) ? workspaceDir : appPath;
  }
  return startPath;
}

function rememberFile(filePath: string) {
  desktopFileAccess.grantRendererReadFile(filePath);
  lastOpenDir = path.dirname(filePath);
  if (lastOpenDir) {
    saveLastOpenDir(lastOpenDir);
  }
}

export function registerDialogHandlers() {
  ipcMain.on(
    DESKTOP_FILE_SYSTEM_CHANNELS.rememberRendererFile,
    (event, filePath: string) => {
      try {
        desktopFileAccess.rememberRendererSelectedFile(filePath);
        event.returnValue = true;
      } catch (error) {
        console.error("[IPC] rememberRendererFile error:", error);
        event.returnValue = false;
      }
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.openFile,
    async (_event: IpcMainInvokeEvent, request: OpenFileDialogRequest) => {
      ensureLoaded();

      const options: OpenDialogOptions = {
        properties: ["openFile"],
        defaultPath: request.defaultPath || getDefaultStartPath(),
        filters: buildOpenFileDialogFilters(request.profile),
      };
      const { canceled, filePaths } = await dialog.showOpenDialog(options);
      if (canceled || filePaths.length === 0) {
        return null;
      }

      const selectedPath = filePaths[0];
      desktopFileAccess.grantRendererReadFile(selectedPath);
      const filePath = desktopFileAccess.resolveExistingPath(selectedPath) ?? selectedPath;
      rememberFile(filePath);

      try {
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
        };
      } catch (error) {
        console.error("Failed to stat file:", error);
        return {
          path: filePath,
          name: path.basename(filePath),
          size: 0,
        };
      }
    },
  );

  ipcMain.handle(DESKTOP_FILE_SYSTEM_CHANNELS.openSubtitleFile, async () => {
    ensureLoaded();

    const options: OpenDialogOptions = {
      properties: ["openFile"],
      defaultPath: getDefaultStartPath(),
      filters: [
        {
          name: "Subtitle Files",
          extensions: ["srt", "vtt", "ass", "ssa", "txt", "sub", "sbv", "lrc"],
        },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const { canceled, filePaths } = await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) {
      return null;
    }

    const selectedPath = filePaths[0];
    desktopFileAccess.grantRendererReadFile(selectedPath);
    const filePath = desktopFileAccess.resolveExistingPath(selectedPath) ?? selectedPath;
    rememberFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
    };
  });

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.selectDirectory,
    async (_event: IpcMainInvokeEvent, request?: SelectDirectoryRequest) => {
      ensureLoaded();

      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        defaultPath: lastOpenDir || undefined,
      });
      if (canceled || filePaths.length === 0) {
        return null;
      }

      const dirPath = filePaths[0];
      if (request?.access === "write") {
        desktopFileAccess.grantRendererWriteDirectory(dirPath, { persist: true });
      } else {
        desktopFileAccess.grantRendererReadDirectory(dirPath);
      }
      lastOpenDir = dirPath;
      saveLastOpenDir(dirPath);
      return dirPath;
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.saveFileDialog,
    async (
      _event: IpcMainInvokeEvent,
      { defaultPath, filters }: SaveFileDialogRequest,
    ) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath,
        filters,
      });

      if (canceled || !filePath) {
        return { canceled: true, filePath: null };
      }

      desktopFileAccess.grantRendererWriteFile(filePath);
      rememberFile(filePath);
      return { canceled: false, filePath };
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.readTextFile,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      try {
        desktopFileAccess.assertRendererReadAccess(filePath, "Read file");
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
      } catch (error) {
        console.error("[IPC] readTextFile error:", error);
        return null;
      }
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeTextFile,
    async (_event: IpcMainInvokeEvent, filePath: string, content: string) => {
      try {
        desktopFileAccess.assertRendererWriteAccess(filePath, "Write file");
        fs.writeFileSync(filePath, content, "utf-8");
        return true;
      } catch (error) {
        console.error("[IPC] writeTextFile error:", error);
        return false;
      }
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.getFileSize,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      try {
        desktopFileAccess.assertRendererReadAccess(filePath, "Get file size");
        return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      } catch (error) {
        console.error("[IPC] getFileSize error:", error);
        return 0;
      }
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.resolveExistingPath,
    async (
      _event: IpcMainInvokeEvent,
      filePath: string,
      fallbackName?: string,
      expectedSize?: number,
    ) => {
      try {
        return filePath
          ? desktopFileAccess.resolveExistingPath(filePath, fallbackName, expectedSize)
          : null;
      } catch (error) {
        console.error("[IPC] resolveExistingPath error:", error);
        return null;
      }
    },
  );
}

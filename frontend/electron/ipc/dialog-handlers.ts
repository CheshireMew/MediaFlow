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
import {
  resolveDesktopRuntimeDataRoot,
  resolveDesktopWorkspaceDir,
} from "../desktopRuntime";
import { desktopFileAccess } from "./file-access";

function getStorePath() {
  return path.join(
    resolveDesktopRuntimeDataRoot(),
    "user_data",
    "user-preferences.json",
  );
}

async function loadLastOpenDir(): Promise<string | undefined> {
  try {
    const storePath = getStorePath();
    try {
      const data = JSON.parse(await fs.promises.readFile(storePath, "utf-8")) as {
        lastOpenDir?: string;
      };
      return data.lastOpenDir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  } catch {
    // Preference corruption should not block the file picker.
  }
  return undefined;
}

async function saveLastOpenDir(dirPath: string) {
  try {
    await fs.promises.mkdir(path.dirname(getStorePath()), { recursive: true });
    await fs.promises.writeFile(
      getStorePath(),
      JSON.stringify({ lastOpenDir: dirPath }),
      "utf-8",
    );
  } catch (error) {
    console.error("Save preferences failed", error);
  }
}

let lastOpenDir: string | undefined;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = loadLastOpenDir().then((loadedDir) => {
      lastOpenDir = loadedDir;
    });
  }
  await loadPromise;
}

async function pathExists(candidate: string) {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function getDefaultStartPath(): Promise<string | undefined> {
  const appPath = app.getAppPath();
  const workspaceDir = resolveDesktopWorkspaceDir();
  const startPath = lastOpenDir;

  if (!startPath) {
    return await pathExists(workspaceDir) ? workspaceDir : appPath;
  }
  if (!await pathExists(startPath)) {
    return await pathExists(workspaceDir) ? workspaceDir : appPath;
  }
  return startPath;
}

async function rememberFile(filePath: string) {
  desktopFileAccess.grantRendererReadFile(filePath);
  lastOpenDir = path.dirname(filePath);
  if (lastOpenDir) {
    await saveLastOpenDir(lastOpenDir);
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
      await ensureLoaded();

      const options: OpenDialogOptions = {
        properties: ["openFile"],
        defaultPath: request.defaultPath || await getDefaultStartPath(),
        filters: buildOpenFileDialogFilters(request.profile),
      };
      const { canceled, filePaths } = await dialog.showOpenDialog(options);
      if (canceled || filePaths.length === 0) {
        return null;
      }

      const selectedPath = filePaths[0];
      desktopFileAccess.grantRendererReadFile(selectedPath);
      const filePath = selectedPath;
      await rememberFile(filePath);

      try {
        const stats = await fs.promises.stat(filePath);
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

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.selectDirectory,
    async (_event: IpcMainInvokeEvent, request?: SelectDirectoryRequest) => {
      await ensureLoaded();

      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        defaultPath: lastOpenDir || undefined,
      });
      if (canceled || filePaths.length === 0) {
        return null;
      }

      const dirPath = filePaths[0];
      if (request?.access === "write") {
        desktopFileAccess.grantRendererWriteDirectory(dirPath);
      } else {
        desktopFileAccess.grantRendererReadDirectory(dirPath);
      }
      lastOpenDir = dirPath;
      await saveLastOpenDir(dirPath);
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
      await rememberFile(filePath);
      return { canceled: false, filePath };
    },
  );

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.readTextFile,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      try {
        desktopFileAccess.assertRendererReadAccess(filePath, "Read file");
        return await fs.promises.readFile(filePath, "utf-8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
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
        await fs.promises.writeFile(filePath, content, "utf-8");
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
        try {
          return (await fs.promises.stat(filePath)).size;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return 0;
          }
          throw error;
        }
      } catch (error) {
        console.error("[IPC] getFileSize error:", error);
        return 0;
      }
    },
  );
}

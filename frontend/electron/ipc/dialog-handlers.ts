/**
 * Dialog & Filesystem IPC Handlers
 *
 * Handles: dialog:openFile, dialog:openSubtitleFile, dialog:selectDirectory,
 *          dialog:saveFile, fs:readFile, fs:writeFile, fs:getFileSize
 */
import { ipcMain, dialog, app } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from "electron";
import path from "path";
import fs from "fs";
import { resolvePathFromDirectoryEntries } from "../../src/services/filesystem/pathRepair";
import { resolveDesktopWorkspaceDir } from "../desktopRuntime";

// ─── Preferences Persistence ────────────────────────────────────

function getStorePath() {
  return path.join(app.getPath("userData"), "user-preferences.json");
}

function loadLastOpenDir(): string | undefined {
  try {
    const p = getStorePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf-8")) as { lastOpenDir?: string };
      return data.lastOpenDir;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function saveLastOpenDir(dirPath: string) {
  try {
    const p = getStorePath();
    fs.writeFileSync(p, JSON.stringify({ lastOpenDir: dirPath }));
  } catch (e) {
    console.error("Save preferences failed", e);
  }
}

// ─── Shared State ───────────────────────────────────────────────
let lastOpenDir: string | undefined = undefined;
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

  let startPath = lastOpenDir;

  // If no last open dir, default to workspace if exists
  if (!startPath) {
    if (fs.existsSync(workspaceDir)) {
      startPath = workspaceDir;
    } else {
      // Fallback to app path if workspace missing
      startPath = appPath;
    }
  } else {
    // Access check
    if (!fs.existsSync(startPath)) {
      startPath = fs.existsSync(workspaceDir) ? workspaceDir : appPath;
    }
  }
  return startPath;
}

function resolveExistingPathOnDisk(filePath: string, fallbackName?: string, expectedSize?: number) {
  if (!filePath) {
    return null;
  }

  const candidateDir = path.dirname(filePath);
  if (!fs.existsSync(candidateDir)) {
    return fs.existsSync(filePath) ? filePath : null;
  }

  const directoryEntries = fs.readdirSync(candidateDir);
  const resolved = resolvePathFromDirectoryEntries(filePath, directoryEntries, fallbackName);
  if (resolved && fs.existsSync(resolved)) {
    return resolved;
  }

  if (typeof expectedSize === "number" && expectedSize >= 0) {
    const extension = path.extname(filePath).toLowerCase();
    const sizeMatches = directoryEntries.filter((entry) => {
      const candidatePath = path.join(candidateDir, entry);
      if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
        return false;
      }
      if (extension && path.extname(entry).toLowerCase() !== extension) {
        return false;
      }
      return fs.statSync(candidatePath).size === expectedSize;
    });

    if (sizeMatches.length === 1) {
      return path.join(candidateDir, sizeMatches[0]);
    }
  }

  return fs.existsSync(filePath) ? filePath : null;
}

// ─── Handler Registration ───────────────────────────────────────
export function registerDialogHandlers() {
  // Open media file
  ipcMain.handle(
    "dialog:openFile",
    async (_event: IpcMainInvokeEvent, defaultPath?: string) => {
      ensureLoaded();

      const options: OpenDialogOptions = {
        properties: ["openFile"],
        defaultPath: defaultPath || getDefaultStartPath(),
        filters: [
          {
            name: "Media Files",
            extensions: [
              "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts",
              "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus",
              "jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif",
            ],
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      };
      const { canceled, filePaths } = await dialog.showOpenDialog(options);

      if (canceled || filePaths.length === 0) {
        return null;
      }

      const selectedPath = filePaths[0];
      const filePath = resolveExistingPathOnDisk(selectedPath) ?? selectedPath;
      lastOpenDir = path.dirname(filePath);
      if (lastOpenDir) saveLastOpenDir(lastOpenDir);
      try {
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
        };
      } catch (e) {
        console.error("Failed to stat file:", e);
        return {
          path: filePath,
          name: path.basename(filePath),
          size: 0,
        };
      }
    },
  );

  // Open subtitle file
  ipcMain.handle("dialog:openSubtitleFile", async () => {
    ensureLoaded();

    const options: OpenDialogOptions = {
      properties: ["openFile"],
      defaultPath: getDefaultStartPath(),
      filters: [
        {
          name: "Subtitle Files",
          extensions: ["srt", "vtt", "ass", "ssa", "txt", "sub", "sbv", "lrc"],
        },
        {
          name: "All Files",
          extensions: ["*"],
        },
      ],
    };
    const { canceled, filePaths } = await dialog.showOpenDialog(options);

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const selectedPath = filePaths[0];
    const filePath = resolveExistingPathOnDisk(selectedPath) ?? selectedPath;
    lastOpenDir = path.dirname(filePath);
    if (lastOpenDir) saveLastOpenDir(lastOpenDir);
    return {
      path: filePath,
      name: path.basename(filePath),
    };
  });

  // Select directory
  ipcMain.handle("dialog:selectDirectory", async () => {
    ensureLoaded();

    const options: OpenDialogOptions = {
      properties: ["openDirectory"],
      defaultPath: lastOpenDir || undefined,
    };
    const { canceled, filePaths } = await dialog.showOpenDialog(options);

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const dirPath = filePaths[0];
    lastOpenDir = dirPath;
    saveLastOpenDir(dirPath);
    return dirPath;
  });

  // Save file dialog
  ipcMain.handle(
    "dialog:saveFile",
    async (
      _event: IpcMainInvokeEvent,
      { defaultPath, filters }: SaveDialogOptions,
    ) => {
      console.log("[Main] dialog:saveFile called with:", {
        defaultPath,
        filters,
      });
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath,
        filters,
      });
      console.log("[Main] dialog:saveFile result:", { canceled, filePath });

      if (canceled) {
        return null;
      } else {
        return filePath;
      }
    },
  );

  // Read file
  ipcMain.handle("fs:readFile", async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
      return null;
    } catch (e) {
      console.error("[IPC] readFile error:", e);
      return null;
    }
  });

  // Write file
  ipcMain.handle(
    "fs:writeFile",
    async (_event: IpcMainInvokeEvent, filePath: string, content: string) => {
      try {
        fs.writeFileSync(filePath, content, "utf-8");
        return true;
      } catch (e) {
        console.error("[IPC] writeFile error:", e);
        return false;
      }
    },
  );

  // Get file size
  ipcMain.handle("fs:getFileSize", async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return stats.size;
      }
      return 0;
    } catch (e) {
      console.error("[IPC] getFileSize error:", e);
      return 0;
    }
  });

  ipcMain.handle(
    "fs:resolveExistingPath",
    async (
      _event: IpcMainInvokeEvent,
      filePath: string,
      fallbackName?: string,
      expectedSize?: number,
    ) => {
      try {
        if (!filePath) {
          return null;
        }

        return resolveExistingPathOnDisk(filePath, fallbackName, expectedSize);
      } catch (e) {
        console.error("[IPC] resolveExistingPath error:", e);
        return null;
      }
    },
  );

  // Read binary file (returns Buffer → auto-serialized to ArrayBuffer over IPC)
  ipcMain.handle("fs:readBinaryFile", async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return null;
    } catch (e) {
      console.error("[IPC] readBinaryFile error:", e);
      return null;
    }
  });

  // Write binary file (receives ArrayBuffer from renderer)
  ipcMain.handle(
    "fs:writeBinaryFile",
    async (_event: IpcMainInvokeEvent, filePath: string, data: ArrayBuffer) => {
      try {
        fs.writeFileSync(filePath, Buffer.from(data));
        return true;
      } catch (e) {
        console.error("[IPC] writeBinaryFile error:", e);
        return false;
      }
    },
  );
}

/**
 * Dialog & Filesystem IPC Handlers
 *
 * Handles: dialog:openFile, dialog:openSubtitleFile, dialog:selectDirectory,
 *          dialog:saveFile, fs:readFile, fs:writeFile, fs:getFileSize
 */
const { ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// ─── Preferences Persistence ────────────────────────────────────
const { app } = require("electron");

function getStorePath() {
  return path.join(app.getPath("userData"), "user-preferences.json");
}

function loadLastOpenDir(): string | undefined {
  try {
    const p = getStorePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      return data.lastOpenDir;
    }
  } catch (e) {
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
  const projectRoot = path.resolve(__dirname, "../../");
  const tempDir = path.join(projectRoot, "temp");
  let startPath = lastOpenDir;
  if (!startPath && fs.existsSync(tempDir)) {
    startPath = tempDir;
  }
  return startPath;
}

// ─── Handler Registration ───────────────────────────────────────
export function registerDialogHandlers() {
  // Open media file
  ipcMain.handle("dialog:openFile", async () => {
    ensureLoaded();

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      defaultPath: getDefaultStartPath(),
      filters: [
        {
          name: "Media Files",
          extensions: ["mp4", "mkv", "avi", "mp3", "wav"],
        },
      ],
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
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
  });

  // Open subtitle file
  ipcMain.handle("dialog:openSubtitleFile", async () => {
    ensureLoaded();

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      defaultPath: getDefaultStartPath(),
      filters: [
        {
          name: "Subtitle Files",
          extensions: ["srt", "vtt", "ass", "ssa", "txt"],
        },
      ],
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
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

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      defaultPath: lastOpenDir || undefined,
    });

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
      _event: any,
      { defaultPath, filters }: { defaultPath?: string; filters?: any[] },
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
  ipcMain.handle("fs:readFile", async (_event: any, filePath: string) => {
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
    async (_event: any, filePath: string, content: string) => {
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
  ipcMain.handle("fs:getFileSize", async (_event: any, filePath: string) => {
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

  // Read binary file (returns Buffer → auto-serialized to ArrayBuffer over IPC)
  ipcMain.handle("fs:readBinaryFile", async (_event: any, filePath: string) => {
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
    async (_event: any, filePath: string, data: ArrayBuffer) => {
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

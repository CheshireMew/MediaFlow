/// <reference types="node" />
/// <reference types="node" />
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// if (require("electron-squirrel-startup")) {
//   app.quit();
// }

// Preferences Management
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

// Initialize state
let lastOpenDir: string | undefined = undefined;
let isLoaded = false;

// IPC: Open File Dialog
ipcMain.handle("dialog:openFile", async () => {
  // Lazy load state to ensure app is ready (app.getPath requires ready)
  if (!isLoaded) {
    lastOpenDir = loadLastOpenDir();
    isLoaded = true;
  }

  // Attempt to resolve project temp directory (assumes dev structure)
  // In production, might need adjustment logic
  const projectRoot = path.resolve(__dirname, "../../");
  const tempDir = path.join(projectRoot, "temp");

  let startPath = lastOpenDir;
  if (!startPath && fs.existsSync(tempDir)) {
    startPath = tempDir;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    defaultPath: startPath,
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mp3", "wav"] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  } else {
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
  }
});

// IPC: Open Subtitle File Dialog
ipcMain.handle("dialog:openSubtitleFile", async () => {
  if (!isLoaded) {
    lastOpenDir = loadLastOpenDir();
    isLoaded = true;
  }

  const projectRoot = path.resolve(__dirname, "../../");
  const tempDir = path.join(projectRoot, "temp");

  let startPath = lastOpenDir;
  if (!startPath && fs.existsSync(tempDir)) {
    startPath = tempDir;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    defaultPath: startPath,
    filters: [
      {
        name: "Subtitle Files",
        extensions: ["srt", "vtt", "ass", "ssa", "txt"],
      },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  } else {
    const filePath = filePaths[0];
    lastOpenDir = path.dirname(filePath);
    if (lastOpenDir) saveLastOpenDir(lastOpenDir);
    return {
      path: filePath,
      name: path.basename(filePath),
    };
  }
});

// IPC: Select Directory Dialog
ipcMain.handle("dialog:selectDirectory", async () => {
  if (!isLoaded) {
    lastOpenDir = loadLastOpenDir();
    isLoaded = true;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    defaultPath: lastOpenDir || undefined,
  });

  if (canceled || filePaths.length === 0) {
    return null;
  } else {
    const dirPath = filePaths[0];
    lastOpenDir = dirPath;
    saveLastOpenDir(lastOpenDir);
    return dirPath;
  }
});
// IPC: Save File Dialog
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

// IPC: Read file content (for subtitle loading)
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

// IPC: Write file content
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

// IPC: Get file size
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

// IPC: Show file in Explorer
const { shell, session } = require("electron");
ipcMain.handle(
  "shell:showInExplorer",
  async (_event: any, filePath: string) => {
    if (filePath) {
      shell.showItemInFolder(filePath);
    }
  },
);

// IPC: Window Controls
ipcMain.on("window:minimize", () => {
  const win = BrowserWindow.getFocusedWindow();
  win?.minimize();
});

ipcMain.on("window:maximize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on("window:close", () => {
  const win = BrowserWindow.getFocusedWindow();
  win?.close();
});

// IPC: Fetch cookies for a domain (visible window for user verification)
ipcMain.handle(
  "cookies:fetch",
  async (_event: any, targetUrl: string): Promise<any[]> => {
    console.log(`[Cookie Fetch] Starting for: ${targetUrl}`);

    return new Promise((resolve, reject) => {
      // Create a VISIBLE browser window so user can complete any verification
      const cookieWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: "请完成验证后关闭此窗口",
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        // Force User-Agent to match what we use in yt-dlp (Chrome 120 on Windows)
        // This is CRITICAL for Douyin cookies to work
        // Use Mobile UA to bypass desktop captcha/login
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      });

      let resolved = false;

      // When user closes the window, extract cookies
      cookieWindow.on("closed", async () => {
        if (resolved) return;
        resolved = true;

        try {
          const urlObj = new URL(targetUrl);
          const domain = urlObj.hostname.replace("www.", "");

          // Get all cookies for this domain
          const cookies = await session.defaultSession.cookies.get({});
          // Filter for the target domain
          const domainCookies = cookies.filter((c: any) =>
            c.domain.includes(domain),
          );
          console.log(
            `[Cookie Fetch] Got ${domainCookies.length} cookies for ${domain}`,
          );

          resolve(domainCookies);
        } catch (err) {
          console.error("[Cookie Fetch] Error getting cookies:", err);
          reject(err);
        }
      });

      // Set a long timeout (5 minutes) in case user forgets
      setTimeout(() => {
        if (!resolved && !cookieWindow.isDestroyed()) {
          console.log("[Cookie Fetch] Timeout reached, extracting cookies...");
          cookieWindow.close();
        }
      }, 300000);

      // Navigate to the target URL
      cookieWindow.loadURL(targetUrl);
    });
  },
);

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Remove standard frame for custom look
    // titleBarStyle: 'hidden',
    // titleBarOverlay: {
    //     color: '#1a1a1a',
    //     symbolColor: '#ffffff',
    //     height: 30
    // },
    // Actually, user wants 'Blue Bar' gone. Standard 'autoHideMenuBar' is not enough.
    // Let's use simple autoHideMenuBar first, but ensure frame matches dark theme if possible.
    // Or just simple frame: false if we implement custom drag region.
    // For now, let's stick to standard frame but ensure dark mode?
    // User said "Blue Bar" which implies Windows default accent color on title bar.
    // Let's try `titleBarStyle: 'hidden'` which integrates the title bar into the content.
    frame: false, // Custom frame
    // titleBarStyle: "hidden", // Removed for custom frame
    // titleBarOverlay: { ... } // Removed for custom frame
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Fix CORS for local dev
    },
  });

  // Check if we are in dev mode
  const isDev = process.env.IS_DEV === "true";

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Hide menu bar for now
  // mainWindow.setMenuBarVisibility(false);

  const { Menu } = require("electron");
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open API Docs",
          click: async () => {
            const { shell } = require("electron");
            await shell.openExternal("http://localhost:8000/docs");
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

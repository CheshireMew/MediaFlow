/// <reference types="node" />
import { app, BrowserWindow, Menu, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";

let backendProcess: ChildProcess | null = null;

function startBackend() {
  const isDev = process.env.IS_DEV === "true";
  
  // Only spawn the bundled backend in production
  if (!isDev && app.isPackaged) {
    // In production, extraResources are placed in process.resourcesPath
    const backendExe = path.join(process.resourcesPath, "backend", "mediaflow-backend.exe");
    
    if (fs.existsSync(backendExe)) {
      console.log("Starting bundled backend:", backendExe);
      backendProcess = spawn(backendExe, [], {
        cwd: path.dirname(backendExe),
        detached: false,
      });

      backendProcess.stdout?.on('data', (data) => console.log(`[Backend] ${data}`));
      backendProcess.stderr?.on('data', (data) => console.error(`[Backend ERR] ${data}`));
      backendProcess.on('close', (code) => console.log(`[Backend] exited with code ${code}`));
    } else {
      console.error("Bundled backend not found at:", backendExe);
    }
  }
}

function killBackend() {
  if (backendProcess && backendProcess.pid) {
    try {
      console.log(`Killing backend process ${backendProcess.pid}`);
      process.kill(backendProcess.pid, 'SIGTERM');
    } catch(e) {
      console.error("Failed to kill backend:", e);
    }
    backendProcess = null;
  }
}

// ─── IPC Handler Registration ───────────────────────────────────
// Each module exports a register function that sets up its IPC handlers.
// This keeps main.ts focused on window creation and app lifecycle.
import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";
import { registerConfigHandlers } from "./ipc/config-handlers";

registerDialogHandlers();
registerWindowHandlers();
registerCookieHandlers();
registerConfigHandlers();

// ─── Main Window ────────────────────────────────────────────────
function createWindow() {
  // Check if we are in dev mode
  const isDev = process.env.IS_DEV === "true";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Custom frame
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !isDev, // Disable only in Dev for localhost CORS
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Application Menu
  const template: Electron.MenuItemConstructorOptions[] = [
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
            await shell.openExternal("http://localhost:8800/docs");
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── App Lifecycle ──────────────────────────────────────────────
app.on("ready", () => {
  startBackend();
  createWindow();
});

app.on("before-quit", () => {
  killBackend();
});

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

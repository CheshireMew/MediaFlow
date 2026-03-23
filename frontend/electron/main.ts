/// <reference types="node" />
import { app, BrowserWindow, Menu, shell } from "electron";
import path from "path";

import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";
import { BackendFallbackProcess } from "./desktop/backendFallback";
import { DesktopTaskHistoryStore } from "./desktop/historyStore";
import { DesktopTaskCoordinator } from "./desktop/taskCoordinator";

const backendFallback = new BackendFallbackProcess();
const desktopTaskCoordinator = new DesktopTaskCoordinator(new DesktopTaskHistoryStore());

function registerIpcHandlers() {
  registerDialogHandlers();
  registerWindowHandlers();
  registerCookieHandlers();
  desktopTaskCoordinator.registerIpcHandlers();
}

function createWindow() {
  const isDev = process.env.IS_DEV === "true";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#1a1b1e",
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !isDev,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

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
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("ready", () => {
  registerIpcHandlers();
  backendFallback.start();
  createWindow();
});

app.on("before-quit", () => {
  backendFallback.stop();
  desktopTaskCoordinator.stop();
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

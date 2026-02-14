/// <reference types="node" />
/// <reference types="node" />
const { app, BrowserWindow } = require("electron");
const path = require("path");

// ─── IPC Handler Registration ───────────────────────────────────
// Each module exports a register function that sets up its IPC handlers.
// This keeps main.ts focused on window creation and app lifecycle.
import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";

registerDialogHandlers();
registerWindowHandlers();
registerCookieHandlers();

// ─── Main Window ────────────────────────────────────────────────
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Custom frame
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

  // Application Menu
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

// ─── App Lifecycle ──────────────────────────────────────────────
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

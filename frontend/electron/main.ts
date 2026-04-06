/// <reference types="node" />
import { app, BrowserWindow, Menu, shell } from "electron";

import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { bindRendererReadyCallback, registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";
import { DesktopTaskHistoryStore } from "./desktop/historyStore";
import { registerDesktopHandlers } from "./ipc/desktop-handlers";
import { DesktopWorkerSupervisor } from "./desktop/workerSupervisor";
import {
  isDesktopDevMode,
  resolveDesktopPreloadScript,
  resolveDesktopRendererTarget,
} from "./desktopRuntime";

const desktopWorkerSupervisor = new DesktopWorkerSupervisor(new DesktopTaskHistoryStore());

function registerIpcHandlers() {
  registerDialogHandlers();
  registerWindowHandlers();
  registerCookieHandlers();
  registerDesktopHandlers(desktopWorkerSupervisor);
}

function createWindow() {
  const isDev = isDesktopDevMode();
  const rendererTarget = resolveDesktopRendererTarget();

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0a0a0a",
    frame: false,
    show: false,
    webPreferences: {
      preload: resolveDesktopPreloadScript(),
      nodeIntegration: false,
      contextIsolation: true,
      // This preload imports local modules, which Electron's sandboxed preload cannot resolve.
      sandbox: false,
      webSecurity: !isDev,
    },
  });

  let loadFailureHandled = false;
  let rendererReady = false;
  let firstFrameReady = false;
  const revealWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };
  const tryRevealWindow = () => {
    if (rendererReady && firstFrameReady) {
      revealWindow();
    }
  };
  const revealFallbackTimer = setTimeout(revealWindow, 4000);
  mainWindow.once("show", () => {
    clearTimeout(revealFallbackTimer);
  });
  mainWindow.once("ready-to-show", () => {
    firstFrameReady = true;
    tryRevealWindow();
  });
  bindRendererReadyCallback(mainWindow, () => {
    rendererReady = true;
    tryRevealWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || loadFailureHandled) {
      return;
    }

    loadFailureHandled = true;
    console.error(
      `[Desktop] Failed to load renderer (${errorCode}): ${errorDescription}. Target: ${validatedURL || rendererTarget.target}`,
    );
    revealWindow();

    const safeDescription = JSON.stringify(errorDescription);
    const safeTarget = JSON.stringify(validatedURL || rendererTarget.target);
    void mainWindow.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(`
        <!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="UTF-8" />
            <title>MediaFlow Startup Error</title>
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #111827;
                color: #e5e7eb;
                font-family: "Segoe UI", sans-serif;
              }
              main {
                width: min(720px, calc(100vw - 48px));
                padding: 32px;
                border-radius: 20px;
                background: rgba(17, 24, 39, 0.92);
                border: 1px solid rgba(148, 163, 184, 0.18);
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
              }
              h1 {
                margin: 0 0 12px;
                font-size: 24px;
              }
              p {
                margin: 0 0 12px;
                line-height: 1.6;
                color: #cbd5e1;
              }
              code {
                display: block;
                margin-top: 16px;
                padding: 14px 16px;
                border-radius: 12px;
                background: rgba(15, 23, 42, 0.9);
                color: #f8fafc;
                word-break: break-all;
                white-space: pre-wrap;
              }
            </style>
          </head>
          <body>
            <main>
              <h1>MediaFlow 桌面端启动失败</h1>
              <p>前端页面入口没有成功加载，已阻止继续停留在黑屏状态。</p>
              <p>请把下面这段信息发给开发者定位：</p>
              <code>Target: ${safeTarget}
Error: ${safeDescription}</code>
            </main>
          </body>
        </html>
      `)}`,
    );
  });

  if (rendererTarget.kind === "url") {
    mainWindow.loadURL(rendererTarget.target);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(rendererTarget.target);
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
          label: "Open Workspace",
          click: async () => {
            await shell.openPath(app.getPath("userData"));
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("ready", () => {
  registerIpcHandlers();
  createWindow();
});

app.on("before-quit", () => {
  desktopWorkerSupervisor.stop();
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

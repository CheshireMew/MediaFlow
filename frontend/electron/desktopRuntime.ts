import { app } from "electron";
import { existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

const DESKTOP_DEV_SERVER_URL = "http://127.0.0.1:5173";
const DESKTOP_RUNTIME_DIRNAME = "runtime";
const MEDIAFLOW_RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR";
const MEDIAFLOW_PYTHON_ENV = "MEDIAFLOW_PYTHON";

export function isDesktopDevMode() {
  return process.env.IS_DEV === "true";
}

export function resolveDesktopDevProjectRoot() {
  return path.resolve(app.getAppPath(), "..");
}

function resolveDesktopDevPythonCommand() {
  const configuredPython = process.env[MEDIAFLOW_PYTHON_ENV]?.trim();
  if (configuredPython) {
    return configuredPython;
  }

  return process.platform === "win32" ? "python" : "python3";
}

export function resolveDesktopPreloadScript() {
  return path.join(__dirname, "preload.js");
}

function resolveDesktopRendererFile() {
  return path.join(app.getAppPath(), "dist", "index.html");
}

function isDesktopSourceCheckout() {
  const appPath = app.getAppPath();
  return existsSync(path.join(appPath, "index.html")) && existsSync(path.join(appPath, "package.json"));
}

function tryBuildDesktopRendererBundle(target: string) {
  if (existsSync(target) || !isDesktopSourceCheckout()) {
    return;
  }

  const appPath = app.getAppPath();
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec || "cmd.exe",
          ["/d", "/s", "/c", `"${path.join(appPath, "node_modules", ".bin", "vite.cmd")}" build`],
          {
            cwd: appPath,
            env: process.env,
            encoding: "utf-8",
            timeout: 300_000,
            windowsVerbatimArguments: true,
          },
        )
      : spawnSync(path.join(appPath, "node_modules", ".bin", "vite"), ["build"], {
          cwd: appPath,
          env: process.env,
          encoding: "utf-8",
          timeout: 300_000,
        });

  if (result.status !== 0 || !existsSync(target)) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    console.error("[Desktop] Failed to auto-build renderer bundle.", {
      target,
      status: result.status,
      stdout,
      stderr,
    });
  }
}

export function resolveDesktopRendererTarget() {
  if (isDesktopDevMode()) {
    return {
      kind: "url" as const,
      target: DESKTOP_DEV_SERVER_URL,
    };
  }

  const target = resolveDesktopRendererFile();
  tryBuildDesktopRendererBundle(target);

  return {
    kind: "file" as const,
    target,
  };
}

export function resolveDesktopRuntimeDataRoot() {
  if (isDesktopDevMode()) {
    return resolveDesktopDevProjectRoot();
  }

  return path.join(app.getPath("userData"), DESKTOP_RUNTIME_DIRNAME);
}

export function resolveDesktopWorkspaceDir() {
  return path.join(resolveDesktopRuntimeDataRoot(), "workspace");
}

export function buildDesktopRuntimeEnv() {
  return {
    [MEDIAFLOW_RUNTIME_DIR_ENV]: resolveDesktopRuntimeDataRoot(),
  };
}

export function resolveBundledDesktopWorkerExecutable() {
  return path.join(process.resourcesPath, "desktop-worker", "mediaflow-desktop-worker.exe");
}

export function resolveDesktopDevWorkerLaunch() {
  return {
    command: resolveDesktopDevPythonCommand(),
    args: ["-m", "backend.desktop_worker"],
    cwd: resolveDesktopDevProjectRoot(),
  };
}

import { app } from "electron";
import { existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

const MEDIAFLOW_RENDERER_DEV_URL_ENV = "MEDIAFLOW_RENDERER_DEV_URL";
const DESKTOP_RUNTIME_DIRNAME = "runtime";
const MEDIAFLOW_RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR";
const MEDIAFLOW_BACKEND_PORT_ENV = "PORT";

export function isDesktopDevMode() {
  return process.env.IS_DEV === "true";
}

export function resolveDesktopDevProjectRoot() {
  return path.resolve(app.getAppPath(), "..");
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
    const devServerUrl = process.env[MEDIAFLOW_RENDERER_DEV_URL_ENV]?.trim();
    if (!devServerUrl) {
      throw new Error(`${MEDIAFLOW_RENDERER_DEV_URL_ENV} is required in desktop dev mode.`);
    }

    return {
      kind: "url" as const,
      target: devServerUrl,
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

export function resolveDesktopResourceDir() {
  if (isDesktopDevMode()) {
    return resolveDesktopDevProjectRoot();
  }

  return process.resourcesPath;
}

export function resolveDesktopManagedBinDir() {
  return path.join(resolveDesktopResourceDir(), "bin");
}

export function resolveDesktopWorkspaceDir() {
  return path.join(resolveDesktopRuntimeDataRoot(), "workspace");
}

export function resolveBundledBackendExecutable() {
  return path.join(process.resourcesPath, "backend", "mediaflow-backend.exe");
}

export function resolvePreferredDesktopBackendPort() {
  return process.env[MEDIAFLOW_BACKEND_PORT_ENV]?.trim() || "8800";
}

export function buildDesktopBackendEnv(port: string) {
  return {
    [MEDIAFLOW_RUNTIME_DIR_ENV]: resolveDesktopRuntimeDataRoot(),
    [MEDIAFLOW_BACKEND_PORT_ENV]: port,
    HOST: "127.0.0.1",
  };
}

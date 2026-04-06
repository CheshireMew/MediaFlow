import { app } from "electron";
import path from "path";

const DESKTOP_DEV_SERVER_URL = "http://localhost:5173";
const DESKTOP_RUNTIME_DIRNAME = "runtime";
const MEDIAFLOW_RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR";

export function isDesktopDevMode() {
  return process.env.IS_DEV === "true";
}

export function resolveDesktopDevProjectRoot() {
  return path.resolve(app.getAppPath(), "..");
}

export function resolveDesktopPreloadScript() {
  return path.join(__dirname, "preload.js");
}

export function resolveDesktopRendererTarget() {
  if (isDesktopDevMode()) {
    return {
      kind: "url" as const,
      target: DESKTOP_DEV_SERVER_URL,
    };
  }

  return {
    kind: "file" as const,
    target: path.join(app.getAppPath(), "dist", "index.html"),
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
    command: "python",
    args: ["-m", "backend.desktop_worker"],
    cwd: resolveDesktopDevProjectRoot(),
  };
}

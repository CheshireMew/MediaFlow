import { app } from "electron";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { spawnSync } from "child_process";

const MEDIAFLOW_RENDERER_DEV_URL_ENV = "MEDIAFLOW_RENDERER_DEV_URL";
const DESKTOP_RUNTIME_DIRNAME = "runtime";
const MEDIAFLOW_RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR";
const MEDIAFLOW_BACKEND_PORT_ENV = "PORT";
const WINDOWS_SHARED_RUNTIME_ROOT = "D:\\Tools\\MediaFlow\\runtime";
const DESKTOP_RUNTIME_MIGRATION_MARKER = ".runtime-migration-v1-complete";

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
  const configuredRuntimeRoot = process.env[MEDIAFLOW_RUNTIME_DIR_ENV]?.trim();
  if (configuredRuntimeRoot) {
    return path.resolve(configuredRuntimeRoot);
  }
  if (isDesktopDevMode()) {
    return resolveDesktopDevProjectRoot();
  }

  if (process.platform === "win32" && existsSync("D:\\")) {
    return WINDOWS_SHARED_RUNTIME_ROOT;
  }

  return path.join(app.getPath("userData"), DESKTOP_RUNTIME_DIRNAME);
}

export function resolveDesktopWorkspaceStatePath() {
  return path.join(resolveDesktopRuntimeDataRoot(), "user_data", "workspace-state.json");
}

function samePath(left: string, right: string) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function copyLegacyPathIfMissing(source: string, target: string) {
  if (samePath(source, target) || existsSync(target) || !existsSync(source)) {
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, {
    recursive: true,
    force: false,
    errorOnExist: false,
    preserveTimestamps: true,
  });
}

export async function migrateDesktopRuntimeData() {
  const runtimeRoot = resolveDesktopRuntimeDataRoot();
  const migrationMarker = path.join(
    runtimeRoot,
    "user_data",
    DESKTOP_RUNTIME_MIGRATION_MARKER,
  );
  if (existsSync(migrationMarker)) {
    return;
  }

  const legacyUserDataRoot = app.getPath("userData");
  const legacyRuntimeRoot = path.join(legacyUserDataRoot, DESKTOP_RUNTIME_DIRNAME);

  if (!samePath(legacyRuntimeRoot, runtimeRoot) && existsSync(legacyRuntimeRoot)) {
    await fs.mkdir(path.dirname(runtimeRoot), { recursive: true });
    await fs.cp(legacyRuntimeRoot, runtimeRoot, {
      recursive: true,
      force: false,
      errorOnExist: false,
      preserveTimestamps: true,
    });
  }

  await copyLegacyPathIfMissing(
    path.join(runtimeRoot, "workspace-state.json"),
    resolveDesktopWorkspaceStatePath(),
  );
  await copyLegacyPathIfMissing(
    path.join(legacyUserDataRoot, "user-preferences.json"),
    path.join(runtimeRoot, "user_data", "user-preferences.json"),
  );

  await fs.mkdir(path.dirname(migrationMarker), { recursive: true });
  await fs.writeFile(migrationMarker, "completed\n", { encoding: "utf-8", flag: "wx" }).catch(
    async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    },
  );
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

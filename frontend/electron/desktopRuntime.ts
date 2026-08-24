import { app } from "electron";
import { existsSync, promises as fs } from "fs";
import path from "path";

const MEDIAFLOW_RENDERER_DEV_URL_ENV = "MEDIAFLOW_RENDERER_DEV_URL";
const DESKTOP_RUNTIME_DIRNAME = "runtime";
const MEDIAFLOW_RUNTIME_DIR_ENV = "MEDIAFLOW_RUNTIME_DIR";
const MEDIAFLOW_BACKEND_PORT_ENV = "PORT";
const WINDOWS_SHARED_RUNTIME_ROOT = "D:\\Tools\\MediaFlow\\runtime";
const DESKTOP_RUNTIME_MIGRATION_MARKER = ".runtime-migration-v2-complete.json";
const MANAGED_RUNTIME_DIRECTORIES = [
  "workspace",
  "output",
  "models",
  "user_data",
  "tools",
  ".cache",
] as const;
const DEFAULT_RUNTIME_MAX_MANAGED_BYTES = 200 * 1024 * 1024 * 1024;
const DEFAULT_RUNTIME_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;

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
  if (!existsSync(target)) {
    throw new Error(
      `Desktop renderer bundle is missing: ${target}. Run the declared build:app command before starting production mode.`,
    );
  }

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

function parseStorageBudget(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

async function measurePathBytes(source: string): Promise<number> {
  const stats = await fs.lstat(source);
  if (stats.isSymbolicLink()) return 0;
  if (stats.isFile()) return stats.size;
  if (!stats.isDirectory()) return 0;
  let total = 0;
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    total += await measurePathBytes(path.join(source, entry.name));
  }
  return total;
}

async function ensureMigrationCapacity(source: string, targetRoot: string) {
  const peakBytes = await measurePathBytes(source);
  const maximumManagedBytes = parseStorageBudget(
    "MEDIAFLOW_RUNTIME_MAX_MANAGED_BYTES",
    DEFAULT_RUNTIME_MAX_MANAGED_BYTES,
  );
  const minimumFreeBytes = parseStorageBudget(
    "MEDIAFLOW_RUNTIME_MIN_FREE_BYTES",
    DEFAULT_RUNTIME_MIN_FREE_BYTES,
  );
  if (peakBytes > maximumManagedBytes) {
    throw new Error(
      `Legacy runtime migration exceeds the managed runtime budget: ${peakBytes} > ${maximumManagedBytes} bytes.`,
    );
  }
  const volume = await fs.statfs(targetRoot);
  const freeBytes = Number(volume.bavail) * Number(volume.bsize);
  if (!Number.isSafeInteger(freeBytes) || freeBytes < peakBytes + minimumFreeBytes) {
    throw new Error(
      `Legacy runtime migration needs ${peakBytes + minimumFreeBytes} free bytes; ${freeBytes} are available.`,
    );
  }
}

async function copyLegacyOwnedPath(source: string, target: string, runtimeRoot: string) {
  if (samePath(source, target) || !existsSync(source)) {
    return;
  }
  const sourceStats = await fs.stat(source);
  if (sourceStats.isFile() && existsSync(target)) return;
  await ensureMigrationCapacity(source, runtimeRoot);
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

  await fs.mkdir(runtimeRoot, { recursive: true });

  const legacyUserDataRoot = app.getPath("userData");
  const legacyRuntimeRoot = path.join(legacyUserDataRoot, DESKTOP_RUNTIME_DIRNAME);

  if (!samePath(legacyRuntimeRoot, runtimeRoot) && existsSync(legacyRuntimeRoot)) {
    for (const directory of MANAGED_RUNTIME_DIRECTORIES) {
      await copyLegacyOwnedPath(
        path.join(legacyRuntimeRoot, directory),
        path.join(runtimeRoot, directory),
        runtimeRoot,
      );
    }
  }

  await copyLegacyOwnedPath(
    path.join(runtimeRoot, "workspace-state.json"),
    resolveDesktopWorkspaceStatePath(),
    runtimeRoot,
  );
  await copyLegacyOwnedPath(
    path.join(legacyUserDataRoot, "user-preferences.json"),
    path.join(runtimeRoot, "user_data", "user-preferences.json"),
    runtimeRoot,
  );

  await fs.mkdir(path.dirname(migrationMarker), { recursive: true });
  await fs.writeFile(
    migrationMarker,
    `${JSON.stringify({
      version: 2,
      source: legacyRuntimeRoot,
      target: runtimeRoot,
      migrated_directories: MANAGED_RUNTIME_DIRECTORIES,
      skipped_directories: [".temp"],
    }, null, 2)}\n`,
    { encoding: "utf-8", flag: "wx" },
  ).catch(
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

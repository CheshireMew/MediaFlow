import { promises as fs } from "fs";
import path from "path";

import { resolveDesktopRuntimeDataRoot } from "./desktopRuntime";

export const DESKTOP_LOG_MAX_BYTES = 10 * 1024 * 1024;
export const DESKTOP_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type LogLevel = "info" | "warning" | "error";

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let logPath: string | null = null;
let queuedWrite: Promise<void> = Promise.resolve();
let initialized = false;
let currentSize = 0;

function serializeArgument(value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

async function pruneExpiredDesktopLogs(directory: string, now = Date.now()) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("mediaflow-desktop.") && entry.name.endsWith(".log"))
      .map(async (entry) => {
        const candidate = path.join(directory, entry.name);
        const stats = await fs.stat(candidate);
        if (now - stats.mtimeMs > DESKTOP_LOG_RETENTION_MS) {
          await fs.unlink(candidate);
        }
      }),
  );
}

async function rotateDesktopLogIfNeeded(nextBytes: number) {
  if (!logPath || currentSize + nextBytes <= DESKTOP_LOG_MAX_BYTES) return;
  const directory = path.dirname(logPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedPath = path.join(directory, `mediaflow-desktop.${timestamp}.log`);
  try {
    await fs.rename(logPath, rotatedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  currentSize = 0;
}

function enqueueDesktopLog(level: LogLevel, args: unknown[]) {
  if (!logPath) return;
  const line = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    process: "electron-main",
    message: args.map(serializeArgument),
  })}\n`;
  const bytes = Buffer.byteLength(line, "utf-8");
  queuedWrite = queuedWrite
    .then(async () => {
      await rotateDesktopLogIfNeeded(bytes);
      await fs.appendFile(logPath!, line, "utf-8");
      currentSize += bytes;
    })
    .catch((error) => {
      originalConsole.error("[Desktop] Failed to write desktop diagnostics.", error);
    });
}

export async function initializeDesktopLogging() {
  if (initialized) return logPath;
  const directory = path.join(resolveDesktopRuntimeDataRoot(), "user_data", "logs");
  logPath = path.join(directory, "mediaflow-desktop.log");
  await fs.mkdir(directory, { recursive: true });
  try {
    currentSize = (await fs.stat(logPath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await pruneExpiredDesktopLogs(directory);

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    enqueueDesktopLog("info", args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    enqueueDesktopLog("warning", args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    enqueueDesktopLog("error", args);
  };
  initialized = true;
  console.log("[Desktop] File diagnostics initialized.", { logPath });
  return logPath;
}

export async function flushDesktopLogging() {
  await queuedWrite;
}

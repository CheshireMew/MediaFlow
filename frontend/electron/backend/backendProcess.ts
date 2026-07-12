import { app } from "electron";
import { existsSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import {
  buildDesktopBackendEnv,
  isDesktopDevMode,
  resolveBundledBackendExecutable,
  resolvePreferredDesktopBackendPort,
} from "../desktopRuntime";
import {
  BACKEND_OUTPUT_DIAGNOSTICS_ENV,
  shouldForwardBackendOutput,
} from "./backendOutputPolicy";

let backendProcess: ChildProcess | null = null;
let backendRuntimeInfoPromise: Promise<DesktopBackendRuntimeInfo> | null = null;
let managedBackendRuntimeInfo: DesktopBackendRuntimeInfo | null = null;

export type DesktopBackendRuntimeInfo = {
  status: "external" | "managed" | "failed";
  host: string;
  port: number | null;
  api_base_url: string;
  ws_base_url: string;
  health_url: string;
  health_status?: "starting" | "ready" | "failed";
  error?: string;
};

const BACKEND_HOST = "127.0.0.1";

function endpointInfo(
  status: DesktopBackendRuntimeInfo["status"],
  port: number | null,
  error?: string,
): DesktopBackendRuntimeInfo {
  const resolvedPort = port ?? 8800;
  return {
    status,
    host: BACKEND_HOST,
    port,
    api_base_url: `http://${BACKEND_HOST}:${resolvedPort}/api/v1`,
    ws_base_url: `ws://${BACKEND_HOST}:${resolvedPort}/api/v1`,
    health_url: `http://${BACKEND_HOST}:${resolvedPort}/health`,
    health_status: status === "failed" ? "failed" : "starting",
    ...(error ? { error } : {}),
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeHealth(url: string, timeoutMs = 500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function monitorBackendHealth(info: DesktopBackendRuntimeInfo) {
  if (info.status === "failed") {
    info.health_status = "failed";
    return;
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await probeHealth(info.health_url)) {
      info.health_status = "ready";
      return;
    }
    await wait(150);
  }

  info.health_status = "failed";
}

function startBackendHealthMonitor(info: DesktopBackendRuntimeInfo) {
  if (info.status === "failed" || info.health_status === "ready") {
    return;
  }

  void monitorBackendHealth(info).catch((error) => {
    console.error("[Backend] health monitor failed:", error);
    info.health_status = "failed";
  });
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid backend port: ${value}`);
  }
  return port;
}

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, BACKEND_HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

function allocatePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, BACKEND_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate backend port.")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function resolveManagedBackendPort() {
  const requested = process.env.PORT?.trim();
  if (requested) {
    const port = parsePort(requested);
    if (!(await isPortAvailable(port))) {
      throw new Error(`Configured backend port ${port} is already in use.`);
    }
    return port;
  }
  const preferred = parsePort(resolvePreferredDesktopBackendPort());
  if (await isPortAvailable(preferred)) {
    return preferred;
  }
  return await allocatePort();
}

function connectBackendOutput(processHandle: ChildProcess) {
  const forwardOutput = shouldForwardBackendOutput(
    isDesktopDevMode(),
    process.env[BACKEND_OUTPUT_DIAGNOSTICS_ENV],
  );

  if (!forwardOutput) {
    // Piped child streams must remain in flowing mode or a verbose backend can
    // eventually block on a full OS pipe. Production intentionally discards
    // their contents instead of forwarding potentially sensitive media data.
    processHandle.stdout?.resume();
    processHandle.stderr?.resume();
    return;
  }

  processHandle.stdout?.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trimEnd()}`);
  });
  processHandle.stderr?.on("data", (data) => {
    console.error(`[Backend ERR] ${data.toString().trimEnd()}`);
  });
}

function resolveExternalBackendInfo(): DesktopBackendRuntimeInfo {
  const apiBase = process.env.VITE_API_URL?.trim();
  const wsBase = process.env.VITE_WS_URL?.trim();
  if (!apiBase || !wsBase) {
    throw new Error("VITE_API_URL and VITE_WS_URL are required for desktop dev runtime.");
  }
  const apiUrl = new URL(apiBase);
  const port = apiUrl.port ? Number(apiUrl.port) : null;
  return {
    status: "external",
    host: apiUrl.hostname,
    port,
    api_base_url: apiBase.replace(/\/$/, ""),
    ws_base_url: wsBase.replace(/\/$/, ""),
    health_url: `${apiUrl.origin}/health`,
    health_status: "starting",
  };
}

async function startManagedBackend(): Promise<DesktopBackendRuntimeInfo> {
  if (backendProcess) {
    if (!managedBackendRuntimeInfo) {
      throw new Error("Backend process is running without runtime endpoint metadata.");
    }
    return managedBackendRuntimeInfo;
  }

  const executable = resolveBundledBackendExecutable();
  if (!existsSync(executable)) {
    const error = `Bundled backend executable not found: ${executable}`;
    console.error("[Backend]", error);
    return endpointInfo("failed", null, error);
  }

  const port = await resolveManagedBackendPort();
  backendProcess = spawn(executable, [], {
    cwd: app.getPath("userData"),
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...buildDesktopBackendEnv(String(port)),
    },
  });

  connectBackendOutput(backendProcess);
  backendProcess.once("exit", (code) => {
    console.log(`[Backend] exited with code ${code}`);
    backendProcess = null;
    managedBackendRuntimeInfo = null;
    backendRuntimeInfoPromise = null;
  });
  backendProcess.once("error", (error) => {
    console.error("[Backend] failed to start:", error);
    backendProcess = null;
  });
  managedBackendRuntimeInfo = endpointInfo("managed", port);
  return managedBackendRuntimeInfo;
}

export function startBundledBackend() {
  if (!backendRuntimeInfoPromise) {
    backendRuntimeInfoPromise = Promise.resolve()
      .then(() => (isDesktopDevMode() ? resolveExternalBackendInfo() : startManagedBackend()))
      .then((info) => {
        startBackendHealthMonitor(info);
        return info;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Backend] failed to initialize runtime:", error);
        return endpointInfo("failed", null, message);
      });
  }
  return backendRuntimeInfoPromise;
}

export async function getDesktopBackendRuntimeInfo() {
  return await startBundledBackend();
}

export function stopBundledBackend() {
  if (!backendProcess?.pid) {
    backendProcess = null;
    return;
  }

  try {
    backendProcess.kill("SIGTERM");
  } catch (error) {
    console.error("[Backend] failed to stop:", error);
  } finally {
    backendProcess = null;
    managedBackendRuntimeInfo = null;
    backendRuntimeInfoPromise = null;
  }
}

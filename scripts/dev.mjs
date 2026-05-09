import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(projectRoot, "frontend");
const frontendRequire = createRequire(path.join(frontendRoot, "package.json"));
const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
const electron = frontendRequire("electron");

const rendererHost = process.env.MEDIAFLOW_RENDERER_DEV_HOST?.trim() || "127.0.0.1";
const backendHost = process.env.MEDIAFLOW_BACKEND_DEV_HOST?.trim() || process.env.HOST?.trim() || "127.0.0.1";
const requestedRendererPort = parseOptionalPort(process.env.MEDIAFLOW_RENDERER_DEV_PORT, "MEDIAFLOW_RENDERER_DEV_PORT");
const requestedBackendPort = parseOptionalPort(
  process.env.MEDIAFLOW_BACKEND_DEV_PORT || process.env.PORT,
  process.env.MEDIAFLOW_BACKEND_DEV_PORT ? "MEDIAFLOW_BACKEND_DEV_PORT" : "PORT",
);
const defaultBackendPort = 8800;
const readyFile = path.join(frontendRoot, "dist-electron", ".dev-build-ready");

let stopping = false;
let viteServer = null;
let electronProcess = null;
let backendProcess = null;
let buildProcess = null;

function parseOptionalPort(value, name) {
  if (!value?.trim()) {
    return null;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return port;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

function allocatePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve an available port.")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function resolvePort({ host, requestedPort, defaultPort, strictName }) {
  if (requestedPort !== null) {
    if (!(await isPortAvailable(host, requestedPort))) {
      throw new Error(`${strictName} ${requestedPort} is already in use.`);
    }
    return requestedPort;
  }

  if (defaultPort && (await isPortAvailable(host, defaultPort))) {
    return defaultPort;
  }

  const port = await allocatePort(host);
  if (defaultPort) {
    console.log(`[dev] ${host}:${defaultPort} is unavailable; using ${host}:${port} for backend.`);
  }
  return port;
}

async function waitForFile(filePath, shouldAbort) {
  while (!shouldAbort()) {
    try {
      await access(filePath, constants.F_OK);
      return;
    } catch {
      await wait(50);
    }
  }
}

function resolveBackendPython() {
  const configuredPython = process.env.MEDIAFLOW_PYTHON?.trim();
  if (configuredPython) {
    return configuredPython;
  }

  if (process.platform === "win32") {
    return path.join(projectRoot, ".venv", "Scripts", "python.exe");
  }
  return path.join(projectRoot, ".venv", "bin", "python");
}

function backendHealthUrl(port) {
  return `http://${backendHost}:${port}/health`;
}

async function probeHealth(url, timeoutMs = 500) {
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

async function waitForBackend(port) {
  const url = backendHealthUrl(port);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (backendProcess?.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready with code ${backendProcess?.exitCode}.`);
    }
    if (await probeHealth(url)) {
      return;
    }
    await wait(150);
  }
  throw new Error(`Backend did not become ready within 60000ms: ${url}`);
}

async function stopProcesses(exitCode) {
  if (stopping) {
    return;
  }
  stopping = true;

  electronProcess?.kill();
  backendProcess?.kill();
  buildProcess?.kill();
  await viteServer?.close();

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void stopProcesses(0);
});
process.on("SIGTERM", () => {
  void stopProcesses(0);
});

function stopOnProcessError(name, child) {
  child.once("error", (error) => {
    if (!stopping) {
      console.error(`[dev] ${name} failed to start:`, error);
      void stopProcesses(1);
    }
  });
}

async function main() {
  await rm(readyFile, { force: true });

  const backendPort = await resolvePort({
    host: backendHost,
    requestedPort: requestedBackendPort,
    defaultPort: defaultBackendPort,
    strictName: requestedBackendPort === null ? "Backend port" : "Configured backend port",
  });
  const rendererPort = await resolvePort({
    host: rendererHost,
    requestedPort: requestedRendererPort,
    defaultPort: null,
    strictName: "Configured renderer port",
  });

  const backendApiBase = `http://${backendHost}:${backendPort}/api/v1`;
  const backendWsBase = `ws://${backendHost}:${backendPort}/api/v1`;
  const rendererOrigin = `http://${rendererHost}:${rendererPort}`;
  process.env.VITE_API_URL = backendApiBase;
  process.env.VITE_WS_URL = backendWsBase;

  buildProcess = spawn(process.execPath, ["./scripts/electron-main-watch.mjs", "--watch"], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: process.env,
  });
  stopOnProcessError("electron main watch", buildProcess);

  let buildExited = false;
  let buildExitCode = 0;
  buildProcess.once("exit", (code) => {
    buildExited = true;
    buildExitCode = code ?? 0;
    if (!stopping) {
      void stopProcesses(buildExitCode || 1);
    }
  });

  const electronMainReady = waitForFile(readyFile, () => buildExited).then(() => {
    if (buildExited) {
      throw new Error(`Electron dev build exited before becoming ready with code ${buildExitCode}.`);
    }
  });
  const python = resolveBackendPython();
  backendProcess = spawn(python, ["run.py"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      HOST: backendHost,
      PORT: String(backendPort),
      MEDIAFLOW_RENDERER_DEV_ORIGIN: rendererOrigin,
      PYTHONIOENCODING: "utf-8",
    },
  });
  stopOnProcessError("backend", backendProcess);
  backendProcess.once("exit", (code) => {
    if (!stopping) {
      void stopProcesses(code ?? 1);
    }
  });

  void waitForBackend(backendPort)
    .then(() => {
      console.log(`[dev] backend ready at ${backendHealthUrl(backendPort)}`);
    })
    .catch((error) => {
      console.error(error);
      void stopProcesses(1);
    });

  await startViteServer(rendererPort);
  await electronMainReady;
  electronProcess = spawn(electron, ["."], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      IS_DEV: "true",
      MEDIAFLOW_RENDERER_DEV_URL: rendererOrigin,
      MEDIAFLOW_RENDERER_DEV_ORIGIN: rendererOrigin,
    },
  });
  stopOnProcessError("electron", electronProcess);

  electronProcess.once("exit", (code) => {
    void stopProcesses(code ?? 0);
  });
}

async function startViteServer(rendererPort) {
  viteServer = await createServer({
    root: frontendRoot,
    configFile: path.join(frontendRoot, "vite.config.ts"),
    server: {
      host: rendererHost,
      port: rendererPort,
      strictPort: true,
    },
  });
  await viteServer.listen();
  viteServer.printUrls();
  return resolveViteOrigin(viteServer);
}

function resolveViteOrigin(server) {
  const localUrl = server.resolvedUrls?.local?.[0];
  if (localUrl) {
    return new URL(localUrl).origin;
  }

  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite server did not expose a usable listen address.");
  }
  return `http://${rendererHost}:${address.port}`;
}

try {
  await main();
} catch (error) {
  console.error(error);
  await stopProcesses(1);
}

import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import net from "node:net";
import { spawn } from "node:child_process";

import electron from "electron";
import { createServer } from "vite";

const projectRoot = process.cwd();
const devServerHost = process.env.MEDIAFLOW_RENDERER_DEV_HOST?.trim() || "127.0.0.1";
const requestedPort = parseOptionalPort(process.env.MEDIAFLOW_RENDERER_DEV_PORT);
const readyFile = path.join(projectRoot, "dist-electron", ".dev-build-ready");

let stopping = false;
let viteServer = null;
let electronProcess = null;
let buildProcess = null;

function parseOptionalPort(value) {
  if (!value?.trim()) {
    return null;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid MEDIAFLOW_RENDERER_DEV_PORT: ${value}`);
  }

  return port;
}

async function resolveAvailablePort(host) {
  if (requestedPort !== null) {
    return requestedPort;
  }

  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve an available dev server port.")));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
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

  return `http://${devServerHost}:${address.port}`;
}

async function waitForFile(filePath, shouldAbort) {
  while (!shouldAbort()) {
    try {
      await access(filePath, constants.F_OK);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function stopProcesses(exitCode) {
  if (stopping) {
    return;
  }
  stopping = true;

  electronProcess?.kill();
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

async function main() {
  await rm(readyFile, { force: true });

  buildProcess = spawn(process.execPath, ["./scripts/electron-dev-build.mjs", "--watch"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  let buildExited = false;
  let buildExitCode = 0;
  buildProcess.once("exit", (code) => {
    buildExited = true;
    buildExitCode = code ?? 0;
    if (!stopping) {
      void stopProcesses(buildExitCode || 1);
    }
  });

  await waitForFile(readyFile, () => buildExited);
  if (buildExited) {
    throw new Error(`Electron dev build exited before becoming ready with code ${buildExitCode}.`);
  }

  const devServerPort = await resolveAvailablePort(devServerHost);

  viteServer = await createServer({
    configFile: path.join(projectRoot, "vite.config.ts"),
    server: {
      host: devServerHost,
      port: devServerPort,
      strictPort: true,
    },
  });
  await viteServer.listen();
  viteServer.printUrls();

  const rendererOrigin = resolveViteOrigin(viteServer);

  electronProcess = spawn(electron, ["."], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      IS_DEV: "true",
      MEDIAFLOW_RENDERER_DEV_URL: rendererOrigin,
      MEDIAFLOW_RENDERER_DEV_ORIGIN: rendererOrigin,
    },
  });

  electronProcess.once("exit", (code) => {
    void stopProcesses(code ?? 0);
  });
}

try {
  await main();
} catch (error) {
  console.error(error);
  await stopProcesses(1);
}

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "playwright";

const unpackedDirectory = resolve("release", "win-unpacked");
const executable = resolve(unpackedDirectory, "MediaFlow.exe");

function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a smoke-test port.")));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), timeoutMs)),
  ]);
}

const backendPort = await allocatePort();
const debuggingPort = await allocatePort();
const runtimeRoot = resolve("..", ".tmp", `mediaflow-electron-smoke-${process.pid}`);
const output = [];
const child = spawn(executable, [`--remote-debugging-port=${debuggingPort}`], {
  cwd: unpackedDirectory,
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(backendPort),
    MEDIAFLOW_RUNTIME_DIR: runtimeRoot,
    MEDIAFLOW_RUNTIME_MAX_MANAGED_BYTES: String(4 * 1024 * 1024 * 1024),
    MEDIAFLOW_RUNTIME_MIN_FREE_BYTES: String(512 * 1024 * 1024),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [child.stdout, child.stderr]) {
  stream?.on("data", (chunk) => {
    output.push(chunk.toString());
    if (output.length > 200) output.shift();
  });
}

let browser;
try {
  const deadline = Date.now() + 120_000;
  let lastError = "remote debugger was unreachable";
  while (Date.now() < deadline && !browser) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before verification with code ${child.exitCode}.`);
    }
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  if (!browser) throw new Error(`Could not connect to production Electron: ${lastError}`);

  const context = browser.contexts()[0];
  if (!context) throw new Error("Production Electron exposed no browser context.");
  const page = context.pages()[0] ?? await context.waitForEvent("page", { timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.electronAPI?.getDesktopRuntimeInfo === "function",
    undefined,
    { timeout: 30_000 },
  );
  const runtime = await page.evaluate(async () => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const value = await window.electronAPI.getDesktopRuntimeInfo();
      if (value.backend.health_status === "ready" || value.backend.health_status === "failed") {
        return value;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    throw new Error("Desktop runtime did not report a terminal backend health state.");
  });
  if (runtime.backend.status !== "managed" || runtime.backend.health_status !== "ready") {
    throw new Error(`Production desktop backend was not ready: ${JSON.stringify(runtime.backend)}`);
  }
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("MediaFlow")) {
    throw new Error("Production renderer did not show the MediaFlow application shell.");
  }
  console.log(`Production Electron ready on backend port ${runtime.backend.port}.`);

  await page.close({ runBeforeUnload: true });
  const gracefulExit = await waitForExit(child, 30_000);
  if (gracefulExit === null) {
    throw new Error("Production Electron did not exit after its last window closed.");
  }
} catch (error) {
  const diagnostics = output.join("").slice(-12_000);
  if (diagnostics) console.error(diagnostics);
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  if (child.exitCode === null && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}

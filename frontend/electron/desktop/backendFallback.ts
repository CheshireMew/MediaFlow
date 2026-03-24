import { app } from "electron";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import {
  buildDesktopRuntimeEnv,
  isDesktopDevMode,
  resolveBundledBackendExecutable,
} from "../desktopRuntime";


export class BackendFallbackProcess {
  private backendProcess: ChildProcess | null = null;

  start() {
    const isDev = isDesktopDevMode();
    if (isDev || !app.isPackaged || this.backendProcess) {
      return;
    }

    const backendExe = resolveBundledBackendExecutable();
    if (!fs.existsSync(backendExe)) {
      console.error("Bundled backend not found at:", backendExe);
      return;
    }

    console.log("Starting bundled backend fallback:", backendExe);
    this.backendProcess = spawn(backendExe, [], {
      cwd: path.dirname(backendExe),
      detached: false,
      env: {
        ...process.env,
        ...buildDesktopRuntimeEnv(),
      },
    });

    this.backendProcess.stdout?.on("data", (data) => console.log(`[Backend] ${data}`));
    this.backendProcess.stderr?.on("data", (data) => console.error(`[Backend ERR] ${data}`));
    this.backendProcess.on("close", (code) => {
      console.log(`[Backend] exited with code ${code}`);
      this.backendProcess = null;
    });
  }

  stop() {
    if (!this.backendProcess?.pid) {
      this.backendProcess = null;
      return;
    }

    try {
      console.log(`Killing backend process ${this.backendProcess.pid}`);
      process.kill(this.backendProcess.pid, "SIGTERM");
    } catch (error) {
      console.error("Failed to kill backend:", error);
    }
    this.backendProcess = null;
  }
}

import { app } from "electron";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import {
  buildDesktopRuntimeEnv,
  isDesktopDevMode,
  resolveBundledDesktopWorkerExecutable,
  resolveDesktopDevWorkerLaunch,
} from "../desktopRuntime";

type DesktopWorkerCommand = {
  command: string;
  args: string[];
  cwd: string;
};

function resolveDesktopWorkerCommand(): DesktopWorkerCommand | null {
  if (!isDesktopDevMode() && app.isPackaged) {
    const workerExe = resolveBundledDesktopWorkerExecutable();
    if (!fs.existsSync(workerExe)) {
      console.error("Bundled desktop worker executable not found at:", workerExe);
      return null;
    }

    return {
      command: workerExe,
      args: [],
      cwd: path.dirname(workerExe),
    };
  }

  return resolveDesktopDevWorkerLaunch();
}

export function startDesktopWorkerProcess(args: {
  onLine: (line: string) => void;
  onClose: (code: number | null) => void;
}): ChildProcess | null {
  const workerCommand = resolveDesktopWorkerCommand();
  if (!workerCommand) {
    return null;
  }

  console.log("Starting desktop worker:", workerCommand.command, workerCommand.args.join(" "));
  const workerProcess = spawn(workerCommand.command, workerCommand.args, {
    cwd: workerCommand.cwd,
    detached: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...buildDesktopRuntimeEnv(),
    },
  });

  let stdoutBuffer = "";
  workerProcess.stdout?.on("data", (data) => {
    stdoutBuffer += data.toString();
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        args.onLine(line);
      }
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });

  workerProcess.stderr?.on("data", (data) => {
    console.error(`[DesktopWorker ERR] ${data}`);
  });

  workerProcess.on("close", args.onClose);
  return workerProcess;
}

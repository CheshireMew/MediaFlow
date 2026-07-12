import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { DESKTOP_FILE_SYSTEM_CHANNELS } from "../../src/contracts/desktopFileSystemContract";
import { resolveDesktopRuntimeDataRoot } from "../desktopRuntime";

function getWorkspaceStatePath() {
  return path.join(resolveDesktopRuntimeDataRoot(), "workspace-state.json");
}

const activeSessionByRenderer = new Map<number, string>();
const latestRevisionBySession = new Map<string, number>();

function parseWorkspaceState(content: string) {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workspace state must be a JSON object.");
  }
  return parsed;
}

function writeWorkspaceStateFile(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
) {
  if (activeSessionByRenderer.get(rendererId) !== sessionId) {
    return false;
  }
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Workspace state revision must be a non-negative safe integer.");
  }
  const latestWriteRevision = latestRevisionBySession.get(sessionId) ?? -1;
  if (revision < latestWriteRevision) {
    return false;
  }

  const parsed = parseWorkspaceState(content);
  const statePath = getWorkspaceStatePath();
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  try {
    const fileDescriptor = fs.openSync(tempPath, "w");
    try {
      fs.writeFileSync(fileDescriptor, `${JSON.stringify(parsed)}\n`, "utf-8");
      fs.fsyncSync(fileDescriptor);
    } finally {
      fs.closeSync(fileDescriptor);
    }
    fs.renameSync(tempPath, statePath);
    latestRevisionBySession.set(sessionId, revision);
    return true;
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // The temporary file may not have been created yet.
    }
    throw error;
  }
}

export function registerWorkspaceStateHandlers() {
  ipcMain.handle(DESKTOP_FILE_SYSTEM_CHANNELS.readWorkspaceState, async (event, sessionId: string) => {
    if (!sessionId) {
      throw new Error("Workspace persistence session id is required.");
    }
    const rendererId = event.sender.id;
    const previousSession = activeSessionByRenderer.get(rendererId);
    if (previousSession) {
      latestRevisionBySession.delete(previousSession);
    }
    activeSessionByRenderer.set(rendererId, sessionId);
    latestRevisionBySession.set(sessionId, -1);
    event.sender.once("destroyed", () => {
      if (activeSessionByRenderer.get(rendererId) === sessionId) {
        activeSessionByRenderer.delete(rendererId);
        latestRevisionBySession.delete(sessionId);
      }
    });
    const statePath = getWorkspaceStatePath();
    return fs.existsSync(statePath)
      ? await fs.promises.readFile(statePath, "utf-8")
      : null;
  });

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceState,
    async (event, content: string, sessionId: string, revision: number) =>
      writeWorkspaceStateFile(event.sender.id, content, sessionId, revision),
  );

  ipcMain.on(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceStateSync,
    (event, content: string, sessionId: string, revision: number) => {
      event.returnValue = writeWorkspaceStateFile(
        event.sender.id,
        content,
        sessionId,
        revision,
      );
    },
  );
}

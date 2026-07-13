import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { DESKTOP_FILE_SYSTEM_CHANNELS } from "../../src/contracts/desktopFileSystemContract";
import { resolveDesktopWorkspaceStatePath } from "../desktopRuntime";

function getWorkspaceStatePath() {
  return resolveDesktopWorkspaceStatePath();
}

const activeSessionByRenderer = new Map<number, string>();
const latestRevisionBySession = new Map<string, number>();
const writeQueueBySession = new Map<string, Promise<boolean>>();

function parseWorkspaceState(content: string) {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workspace state must be a JSON object.");
  }
  return parsed;
}

function validateWorkspaceStateWrite(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
): object | false {
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

  return parseWorkspaceState(content);
}

function writeWorkspaceStateFileSync(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
) {
  const parsed = validateWorkspaceStateWrite(rendererId, content, sessionId, revision);
  if (parsed === false) {
    return false;
  }
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

async function writeWorkspaceStateFile(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
) {
  const previousWrite = writeQueueBySession.get(sessionId) ?? Promise.resolve(true);
  const nextWrite = previousWrite.catch(() => false).then(async () => {
    const parsed = validateWorkspaceStateWrite(rendererId, content, sessionId, revision);
    if (parsed === false) {
      return false;
    }
    const statePath = getWorkspaceStatePath();
    const tempPath = `${statePath}.${process.pid}.${rendererId}.${revision}.tmp`;
    await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
    try {
      const file = await fs.promises.open(tempPath, "w");
      try {
        await file.writeFile(`${JSON.stringify(parsed)}\n`, "utf-8");
        await file.sync();
      } finally {
        await file.close();
      }
      if (validateWorkspaceStateWrite(rendererId, content, sessionId, revision) === false) {
        await fs.promises.unlink(tempPath).catch((): void => {});
        return false;
      }
      fs.renameSync(tempPath, statePath);
      latestRevisionBySession.set(sessionId, revision);
      return true;
    } catch (error) {
      await fs.promises.unlink(tempPath).catch((): void => {});
      throw error;
    }
  });
  writeQueueBySession.set(sessionId, nextWrite);
  try {
    return await nextWrite;
  } finally {
    if (writeQueueBySession.get(sessionId) === nextWrite) {
      writeQueueBySession.delete(sessionId);
    }
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
        writeQueueBySession.delete(sessionId);
      }
    });
    const statePath = getWorkspaceStatePath();
    try {
      return await fs.promises.readFile(statePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  });

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceState,
    async (event, content: string, sessionId: string, revision: number) =>
      writeWorkspaceStateFile(event.sender.id, content, sessionId, revision),
  );

  ipcMain.on(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceStateSync,
    (event, content: string, sessionId: string, revision: number) => {
      event.returnValue = writeWorkspaceStateFileSync(
        event.sender.id,
        content,
        sessionId,
        revision,
      );
    },
  );
}

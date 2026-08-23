import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { DESKTOP_FILE_SYSTEM_CHANNELS } from "../../src/contracts/desktopFileSystemContract";
import { resolveDesktopWorkspaceStatePath } from "../desktopRuntime";
import { withTransientFileRetry } from "../persistence/transientFileRetry";

function getWorkspaceStatePath() {
  return resolveDesktopWorkspaceStatePath();
}

const activeSessionByRenderer = new Map<number, string>();
const latestRevisionBySession = new Map<string, number>();
const workspaceStateBySession = new Map<string, Record<string, unknown>>();
let workspaceWriteQueue: Promise<boolean> = Promise.resolve(true);

type WorkspaceState = Record<string, unknown>;
type WorkspacePatchOperation =
  | { op: "set"; path: Array<string | number>; value: unknown }
  | { op: "delete"; path: Array<string | number> };
type WorkspacePatchEnvelope = {
  format: "mediaflow-workspace-patch-v1";
  operations: WorkspacePatchOperation[];
};
type WorkspaceJournalRecord = WorkspacePatchEnvelope & {
  sessionId: string;
  revision: number;
};

const JOURNAL_COMPACT_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is WorkspaceState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspacePatch(value: WorkspaceState | WorkspacePatchEnvelope): value is WorkspacePatchEnvelope {
  return value.format === "mediaflow-workspace-patch-v1" && Array.isArray(value.operations);
}

function parseWorkspaceState(content: string): WorkspaceState {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Workspace state must be a JSON object.");
  }
  return parsed;
}

function isSafePathPart(value: unknown): value is string | number {
  return (
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === "string"
      && value.length > 0
      && value !== "__proto__"
      && value !== "prototype"
      && value !== "constructor")
  );
}

function parseWorkspaceWrite(content: string): WorkspaceState | WorkspacePatchEnvelope {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Workspace state write must be a JSON object.");
  }
  if (parsed.format !== "mediaflow-workspace-patch-v1") {
    return parsed;
  }
  if (!Array.isArray(parsed.operations)) {
    throw new Error("Workspace patch operations must be an array.");
  }
  const operations = parsed.operations.map((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.path) || candidate.path.length === 0) {
      throw new Error("Workspace patch operation path is invalid.");
    }
    const operationPath = candidate.path;
    if (!operationPath.every(isSafePathPart)) {
      throw new Error("Workspace patch operation contains an unsafe path.");
    }
    if (candidate.op === "delete") {
      return { op: "delete" as const, path: operationPath };
    }
    if (candidate.op === "set" && "value" in candidate) {
      return { op: "set" as const, path: operationPath, value: candidate.value };
    }
    throw new Error("Workspace patch operation is invalid.");
  });
  return { format: "mediaflow-workspace-patch-v1", operations };
}

function applyWorkspacePatch(state: WorkspaceState, patch: WorkspacePatchEnvelope) {
  for (const operation of patch.operations) {
    let parent: WorkspaceState | unknown[] = state;
    for (let index = 0; index < operation.path.length - 1; index += 1) {
      const part = operation.path[index];
      const nextPart = operation.path[index + 1];
      const existing = parent[part as never] as unknown;
      if (isRecord(existing) || Array.isArray(existing)) {
        parent = existing;
        continue;
      }
      const created: WorkspaceState | unknown[] = typeof nextPart === "number" ? [] : {};
      parent[part as never] = created as never;
      parent = created;
    }
    const finalPart = operation.path.at(-1)!;
    if (operation.op === "delete") {
      if (Array.isArray(parent) && typeof finalPart === "number") delete parent[finalPart];
      else delete parent[finalPart as never];
    } else {
      parent[finalPart as never] = operation.value as never;
    }
  }
  return state;
}

function getWorkspaceJournalPath() {
  return `${getWorkspaceStatePath()}.journal`;
}

function readWorkspaceStateFromDiskSync(): WorkspaceState {
  let state: WorkspaceState = {};
  try {
    state = parseWorkspaceState(fs.readFileSync(getWorkspaceStatePath(), "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    const latestRevisionByJournalSession = new Map<string, number>();
    for (const line of fs.readFileSync(getWorkspaceJournalPath(), "utf-8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as WorkspaceJournalRecord;
        const patch = parseWorkspaceWrite(JSON.stringify(record));
        if (!isWorkspacePatch(patch) || typeof record.sessionId !== "string") continue;
        const latestRevision = latestRevisionByJournalSession.get(record.sessionId) ?? -1;
        if (!Number.isSafeInteger(record.revision) || record.revision <= latestRevision) continue;
        applyWorkspacePatch(state, patch);
        latestRevisionByJournalSession.set(record.sessionId, record.revision);
      } catch {
        // A truncated final journal record is ignored; earlier fsynced records remain recoverable.
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return state;
}

function writeFullWorkspaceStateSync(state: WorkspaceState) {
  const statePath = getWorkspaceStatePath();
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  try {
    const fileDescriptor = fs.openSync(tempPath, "w");
    try {
      fs.writeFileSync(fileDescriptor, `${JSON.stringify(state)}\n`, "utf-8");
      fs.fsyncSync(fileDescriptor);
    } finally {
      fs.closeSync(fileDescriptor);
    }
    fs.renameSync(tempPath, statePath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* no temporary file */ }
    throw error;
  }
}

function appendWorkspacePatchSync(record: WorkspaceJournalRecord) {
  const journalPath = getWorkspaceJournalPath();
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const descriptor = fs.openSync(journalPath, "a");
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf-8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function compactWorkspaceJournalSync(state: WorkspaceState) {
  try {
    if (fs.statSync(getWorkspaceJournalPath()).size < JOURNAL_COMPACT_BYTES) return;
  } catch {
    return;
  }
  writeFullWorkspaceStateSync(state);
  fs.writeFileSync(getWorkspaceJournalPath(), "", "utf-8");
}

async function writeFullWorkspaceState(
  state: WorkspaceState,
  rendererId: number,
  revision: number,
) {
  const statePath = getWorkspaceStatePath();
  const tempPath = `${statePath}.${process.pid}.${rendererId}.${revision}.tmp`;
  await withTransientFileRetry(async () => {
    try {
      await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
      const file = await fs.promises.open(tempPath, "w");
      try {
        await file.writeFile(`${JSON.stringify(state)}\n`, "utf-8");
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.promises.rename(tempPath, statePath);
    } catch (error) {
      await fs.promises.unlink(tempPath).catch((): void => {});
      throw error;
    }
  });
}

async function appendWorkspacePatch(record: WorkspaceJournalRecord) {
  const journalPath = getWorkspaceJournalPath();
  const serialized = JSON.stringify(record);
  await withTransientFileRetry(async (attempt) => {
    await fs.promises.mkdir(path.dirname(journalPath), { recursive: true });
    const file = await fs.promises.open(journalPath, "a");
    try {
      // A retry may follow a partial Windows write.  The leading newline keeps
      // that fragment isolated so journal recovery can still parse this copy.
      const separator = attempt > 0 ? "\n" : "";
      await file.writeFile(`${separator}${serialized}\n`, "utf-8");
      await file.sync();
    } finally {
      await file.close();
    }
  });
}

async function compactWorkspaceJournal(
  state: WorkspaceState,
  rendererId: number,
  revision: number,
) {
  try {
    if ((await fs.promises.stat(getWorkspaceJournalPath())).size < JOURNAL_COMPACT_BYTES) return;
  } catch {
    return;
  }
  await writeFullWorkspaceState(state, rendererId, revision);
  await withTransientFileRetry(() =>
    fs.promises.writeFile(getWorkspaceJournalPath(), "", "utf-8"),
  );
}

function validateWorkspaceStateWrite(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
): WorkspaceState | WorkspacePatchEnvelope | false {
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

  return parseWorkspaceWrite(content);
}

function writeWorkspaceStateFileSync(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
) {
  const write = validateWorkspaceStateWrite(rendererId, content, sessionId, revision);
  if (write === false) {
    return false;
  }
  if (isWorkspacePatch(write)) {
    const state = workspaceStateBySession.get(sessionId) ?? readWorkspaceStateFromDiskSync();
    appendWorkspacePatchSync({ ...write, sessionId, revision });
    if ((latestRevisionBySession.get(sessionId) ?? -1) <= revision) {
      applyWorkspacePatch(state, write);
      workspaceStateBySession.set(sessionId, state);
      compactWorkspaceJournalSync(state);
    }
  } else {
    writeFullWorkspaceStateSync(write);
    fs.writeFileSync(getWorkspaceJournalPath(), "", "utf-8");
    workspaceStateBySession.set(sessionId, write);
  }
  latestRevisionBySession.set(sessionId, revision);
  return true;
}

async function writeWorkspaceStateFile(
  rendererId: number,
  content: string,
  sessionId: string,
  revision: number,
) {
  const nextWrite = workspaceWriteQueue.catch(() => false).then(async () => {
    const write = validateWorkspaceStateWrite(rendererId, content, sessionId, revision);
    if (write === false) return false;
    if (isWorkspacePatch(write)) {
      const state = workspaceStateBySession.get(sessionId) ?? readWorkspaceStateFromDiskSync();
      await appendWorkspacePatch({ ...write, sessionId, revision });
      if (validateWorkspaceStateWrite(rendererId, content, sessionId, revision) === false) {
        return false;
      }
      applyWorkspacePatch(state, write);
      workspaceStateBySession.set(sessionId, state);
      latestRevisionBySession.set(sessionId, revision);
      await compactWorkspaceJournal(state, rendererId, revision);
      return true;
    }
    await writeFullWorkspaceState(write, rendererId, revision);
    await fs.promises.writeFile(getWorkspaceJournalPath(), "", "utf-8");
    workspaceStateBySession.set(sessionId, write);
    latestRevisionBySession.set(sessionId, revision);
    return true;
  });
  workspaceWriteQueue = nextWrite;
  return nextWrite;
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
        workspaceStateBySession.delete(sessionId);
      }
    });
    const state = readWorkspaceStateFromDiskSync();
    workspaceStateBySession.set(sessionId, state);
    return Object.keys(state).length > 0 ? `${JSON.stringify(state)}\n` : null;
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

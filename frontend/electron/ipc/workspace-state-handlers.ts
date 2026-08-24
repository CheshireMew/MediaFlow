import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { DESKTOP_FILE_SYSTEM_CHANNELS } from "../../src/contracts/desktopFileSystemContract";
import {
  WORKSPACE_PATCH_FORMAT,
  type WorkspacePatchEnvelope,
  type WorkspaceState,
} from "../../src/contracts/workspaceStateContract";
import { resolveDesktopWorkspaceStatePath } from "../desktopRuntime";
import { withTransientFileRetry } from "../persistence/transientFileRetry";

function getWorkspaceStatePath() {
  return resolveDesktopWorkspaceStatePath();
}

const activeSessionByRenderer = new Map<number, string>();
const latestRevisionBySession = new Map<string, number>();
const workspaceStateBySession = new Map<string, Record<string, unknown>>();
let workspaceWriteQueue: Promise<boolean> = Promise.resolve(true);

type WorkspaceJournalRecord = WorkspacePatchEnvelope & {
  sessionId: string;
  revision: number;
};

const JOURNAL_COMPACT_BYTES = 1024 * 1024;
const MAX_WORKSPACE_STATE_BYTES = 16 * 1024 * 1024;
const MAX_WORKSPACE_PATCH_BYTES = 4 * 1024 * 1024;
const MAX_WORKSPACE_OPERATIONS = 4_096;
const MAX_WORKSPACE_PATH_DEPTH = 32;
const MAX_WORKSPACE_VALUE_DEPTH = 64;
const MAX_WORKSPACE_VALUE_NODES = 200_000;
const MAX_WORKSPACE_STRING_LENGTH = 2 * 1024 * 1024;

function isRecord(value: unknown): value is WorkspaceState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspacePatch(value: WorkspaceState | WorkspacePatchEnvelope): value is WorkspacePatchEnvelope {
  return value.format === WORKSPACE_PATCH_FORMAT && Array.isArray(value.operations);
}

function assertContentByteLimit(content: string, limit: number, label: string) {
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > limit) {
    throw new Error(`${label} exceeds the ${limit}-byte persistence limit.`);
  }
}

function assertWorkspaceValueBudget(value: unknown) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_WORKSPACE_VALUE_NODES) {
      throw new Error("Workspace state contains too many values.");
    }
    if (current.depth > MAX_WORKSPACE_VALUE_DEPTH) {
      throw new Error("Workspace state exceeds the supported nesting depth.");
    }
    if (typeof current.value === "string" && current.value.length > MAX_WORKSPACE_STRING_LENGTH) {
      throw new Error("Workspace state contains an oversized string value.");
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    } else if (isRecord(current.value)) {
      for (const [key, child] of Object.entries(current.value)) {
        if (!isSafePathPart(key)) {
          throw new Error("Workspace state contains an unsafe object key.");
        }
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}

function parseWorkspaceState(content: string): WorkspaceState {
  assertContentByteLimit(content, MAX_WORKSPACE_STATE_BYTES, "Workspace state");
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Workspace state must be a JSON object.");
  }
  assertWorkspaceValueBudget(parsed);
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

export function parseWorkspaceWrite(content: string): WorkspaceState | WorkspacePatchEnvelope {
  assertContentByteLimit(content, MAX_WORKSPACE_STATE_BYTES, "Workspace write");
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Workspace state write must be a JSON object.");
  }
  if (parsed.format !== WORKSPACE_PATCH_FORMAT) {
    assertWorkspaceValueBudget(parsed);
    return parsed;
  }
  assertContentByteLimit(content, MAX_WORKSPACE_PATCH_BYTES, "Workspace patch");
  if (!Array.isArray(parsed.operations)) {
    throw new Error("Workspace patch operations must be an array.");
  }
  if (parsed.operations.length > MAX_WORKSPACE_OPERATIONS) {
    throw new Error("Workspace patch contains too many operations.");
  }
  const operations = parsed.operations.map((candidate) => {
    if (
      !isRecord(candidate)
      || !Array.isArray(candidate.path)
      || candidate.path.length === 0
      || candidate.path.length > MAX_WORKSPACE_PATH_DEPTH
    ) {
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
      assertWorkspaceValueBudget(candidate.value);
      return { op: "set" as const, path: operationPath, value: candidate.value };
    }
    throw new Error("Workspace patch operation is invalid.");
  });
  return { format: WORKSPACE_PATCH_FORMAT, operations };
}

export function applyWorkspaceJournal(state: WorkspaceState, content: string) {
  assertContentByteLimit(
    content,
    JOURNAL_COMPACT_BYTES + MAX_WORKSPACE_PATCH_BYTES,
    "Workspace journal",
  );
  const lines = content.split(/\r?\n/);
  let finalRecordIndex = lines.length - 1;
  while (finalRecordIndex >= 0 && !lines[finalRecordIndex].trim()) {
    finalRecordIndex -= 1;
  }
  const latestRevisionByJournalSession = new Map<string, number>();
  for (let index = 0; index <= finalRecordIndex; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record: WorkspaceJournalRecord;
    try {
      record = JSON.parse(line) as WorkspaceJournalRecord;
    } catch (error) {
      if (index === finalRecordIndex) {
        break;
      }
      throw new Error(`Workspace journal is corrupt at record ${index + 1}.`, {
        cause: error,
      });
    }
    const patch = parseWorkspaceWrite(JSON.stringify(record));
    if (!isWorkspacePatch(patch) || typeof record.sessionId !== "string") {
      throw new Error(`Workspace journal record ${index + 1} is invalid.`);
    }
    const latestRevision = latestRevisionByJournalSession.get(record.sessionId) ?? -1;
    if (!Number.isSafeInteger(record.revision) || record.revision <= latestRevision) {
      throw new Error(`Workspace journal record ${index + 1} has an invalid revision.`);
    }
    applyWorkspacePatch(state, patch);
    latestRevisionByJournalSession.set(record.sessionId, record.revision);
  }
  return state;
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

async function readWorkspaceStateFromDisk(): Promise<WorkspaceState> {
  let state: WorkspaceState = {};
  try {
    state = parseWorkspaceState(await fs.promises.readFile(getWorkspaceStatePath(), "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    state = applyWorkspaceJournal(
      state,
      await fs.promises.readFile(getWorkspaceJournalPath(), "utf-8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return state;
}

async function writeTextFileAtomic(targetPath: string, content: string, suffix: string) {
  const tempPath = `${targetPath}.${suffix}.tmp`;
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    const file = await fs.promises.open(tempPath, "w");
    try {
      await file.writeFile(content, "utf-8");
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    await fs.promises.unlink(tempPath).catch((): void => {});
    throw error;
  }
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
  await withTransientFileRetry(async () => {
    let current = "";
    try {
      current = await fs.promises.readFile(journalPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const prefix = current && !current.endsWith("\n") ? `${current}\n` : current;
    await writeTextFileAtomic(
      journalPath,
      `${prefix}${JSON.stringify(record)}\n`,
      `${process.pid}.${record.sessionId}.${record.revision}.journal`,
    );
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
    writeTextFileAtomic(
      getWorkspaceJournalPath(),
      "",
      `${process.pid}.${rendererId}.${revision}.compact`,
    ),
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
  if (revision <= latestWriteRevision) {
    return false;
  }

  return parseWorkspaceWrite(content);
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
      const state = workspaceStateBySession.get(sessionId) ?? await readWorkspaceStateFromDisk();
      await appendWorkspacePatch({ ...write, sessionId, revision });
      applyWorkspacePatch(state, write);
      workspaceStateBySession.set(sessionId, state);
      latestRevisionBySession.set(sessionId, revision);
      await compactWorkspaceJournal(state, rendererId, revision);
      return true;
    }
    await writeFullWorkspaceState(write, rendererId, revision);
    await writeTextFileAtomic(
      getWorkspaceJournalPath(),
      "",
      `${process.pid}.${rendererId}.${revision}.replace`,
    );
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
    const readOperation = workspaceWriteQueue.catch(() => false).then(async () => {
      const previousSession = activeSessionByRenderer.get(rendererId);
      if (previousSession) {
        latestRevisionBySession.delete(previousSession);
        workspaceStateBySession.delete(previousSession);
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
      const state = await readWorkspaceStateFromDisk();
      workspaceStateBySession.set(sessionId, state);
      return Object.keys(state).length > 0 ? `${JSON.stringify(state)}\n` : null;
    });
    workspaceWriteQueue = readOperation.then(() => true, () => false);
    return await readOperation;
  });

  ipcMain.handle(
    DESKTOP_FILE_SYSTEM_CHANNELS.writeWorkspaceState,
    async (event, content: string, sessionId: string, revision: number) =>
      writeWorkspaceStateFile(event.sender.id, content, sessionId, revision),
  );
}

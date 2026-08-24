import { getDesktopApi } from "../desktop";
import {
  clearPersistenceFailure,
  reportPersistenceFailure,
} from "./persistenceHealth";
import {
  WORKSPACE_PATCH_FORMAT,
  type WorkspacePatchEnvelope,
  type WorkspacePatchOperation,
  type WorkspaceState,
} from "../../contracts/workspaceStateContract";

const WORKSPACE_STORAGE_KEY = "mediaflow:workspace-state:v1";
const WRITE_DEBOUNCE_MS = 250;
const MAX_AUTOMATIC_WRITE_ATTEMPTS = 3;

function createPersistenceSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const persistenceSessionId = createPersistenceSessionId();

let cachedWorkspaceState: WorkspaceState = readStorage();
let lastPersistedWorkspaceState: WorkspaceState = {};
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let dirty = false;
let desktopPersistenceAvailable = false;
let pendingWrite: Promise<void> | null = null;
let writeRevision = 0;
let lastCompletedRevision = 0;
let mutationRevision = 0;
let automaticWriteAttempts = 0;
const dirtyKeys = new Set<string>();
const mutationRevisionByKey = new Map<string, number>();
const initializedListeners = new Set<() => void>();

function isRecord(value: unknown): value is WorkspaceState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createJsonWorkspaceSnapshot(state: WorkspaceState): WorkspaceState {
  const serialized = JSON.stringify(state);
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) {
    throw new Error("Workspace state must serialize to a JSON object.");
  }
  return parsed;
}

function readStorage(): WorkspaceState {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    console.warn("[WorkspaceState] Failed to restore workspace state.", error);
    return {};
  }
}

function appendWorkspaceDiff(
  previous: unknown,
  next: unknown,
  path: Array<string | number>,
  operations: WorkspacePatchOperation[],
) {
  if (Object.is(previous, next)) return;
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) {
      operations.push({ op: "set", path, value: next });
      return;
    }
    for (let index = 0; index < next.length; index += 1) {
      appendWorkspaceDiff(previous[index], next[index], [...path, index], operations);
    }
    return;
  }
  if (isRecord(previous) && isRecord(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
      if (!(key in next)) {
        operations.push({ op: "delete", path: [...path, key] });
      } else {
        appendWorkspaceDiff(previous[key], next[key], [...path, key], operations);
      }
    }
    return;
  }
  operations.push({ op: "set", path, value: next });
}

function buildPatchEnvelope(
  target: WorkspaceState,
  keys: ReadonlySet<string>,
): WorkspacePatchEnvelope {
  const operations: WorkspacePatchOperation[] = [];
  for (const key of keys) {
    const operationStart = operations.length;
    if (!(key in target)) {
      operations.push({ op: "delete", path: [key] });
      continue;
    }
    appendWorkspaceDiff(
      lastPersistedWorkspaceState[key],
      target[key],
      [key],
      operations,
    );
    if (operations.length - operationStart > 512) {
      operations.splice(operationStart);
      operations.push({ op: "set", path: [key], value: target[key] });
    }
  }
  return { format: WORKSPACE_PATCH_FORMAT, operations };
}

function scheduleWrite() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
  }
  writeTimer = setTimeout(() => {
    void flushWorkspaceState();
  }, WRITE_DEBOUNCE_MS);
}

export async function initializeWorkspaceState() {
  const desktopApi = getDesktopApi();
  const desktopReader = desktopApi?.readWorkspaceState;
  desktopPersistenceAvailable = Boolean(desktopReader);
  if (desktopReader) {
    try {
      const raw = await desktopReader(persistenceSessionId);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) {
          const pendingState = cachedWorkspaceState;
          cachedWorkspaceState = { ...parsed };
          for (const key of dirtyKeys) {
            if (key in pendingState) cachedWorkspaceState[key] = pendingState[key];
            else delete cachedWorkspaceState[key];
          }
          lastPersistedWorkspaceState = parsed;
        }
      } else {
        lastPersistedWorkspaceState = {};
      }
      clearPersistenceFailure("workspace-read");
    } catch (error) {
      console.warn("[WorkspaceState] Failed to load desktop workspace state.", error);
      reportPersistenceFailure("workspace-read", error);
    }
  }

  initialized = true;
  for (const listener of initializedListeners) {
    listener();
  }
  if (dirty) {
    await flushWorkspaceState();
  }
}

export function subscribeWorkspaceStateInitialized(listener: () => void) {
  initializedListeners.add(listener);
  if (initialized) {
    listener();
  }
  return () => initializedListeners.delete(listener);
}

export function readWorkspaceStateValue<T>(key: string): T | null {
  const value = cachedWorkspaceState[key];
  return value === undefined ? null : (value as T);
}

export function writeWorkspaceStateValue<T>(key: string, value: T | null) {
  if (value === null || value === undefined) {
    const next = { ...cachedWorkspaceState };
    delete next[key];
    cachedWorkspaceState = next;
  } else {
    cachedWorkspaceState = { ...cachedWorkspaceState, [key]: value };
  }
  dirtyKeys.add(key);
  mutationRevisionByKey.set(key, ++mutationRevision);
  dirty = true;
  automaticWriteAttempts = 0;
  scheduleWrite();
}

function markWorkspaceKeysPersisted(
  targetSnapshot: WorkspaceState,
  keyRevisions: ReadonlyMap<string, number>,
  revision: number,
) {
  if (revision < lastCompletedRevision) {
    return;
  }
  lastCompletedRevision = revision;
  lastPersistedWorkspaceState = targetSnapshot;
  for (const [key, keyRevision] of keyRevisions) {
    if (mutationRevisionByKey.get(key) === keyRevision) {
      dirtyKeys.delete(key);
    }
  }
  dirty = dirtyKeys.size > 0;
}

export async function flushWorkspaceState(): Promise<void> {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (pendingWrite) {
    await pendingWrite;
  }
  if (!dirty) {
    return;
  }
  let targetSnapshot: WorkspaceState;
  try {
    targetSnapshot = createJsonWorkspaceSnapshot(cachedWorkspaceState);
  } catch (error) {
    console.warn("[WorkspaceState] Workspace state is not JSON serializable.", error);
    reportPersistenceFailure("workspace-write", error);
    throw error;
  }
  const keysToWrite = new Set(dirtyKeys);
  const keyRevisions = new Map(
    [...keysToWrite].map((key) => [key, mutationRevisionByKey.get(key) ?? 0]),
  );
  const revision = ++writeRevision;
  const patch = buildPatchEnvelope(targetSnapshot, keysToWrite);
  if (patch.operations.length === 0) {
    markWorkspaceKeysPersisted(targetSnapshot, keyRevisions, revision);
    return;
  }
  const serialized = desktopPersistenceAvailable
    ? JSON.stringify(patch)
    : JSON.stringify(targetSnapshot);
  const write = (async () => {
    try {
      const desktopWriter = getDesktopApi()?.writeWorkspaceState;
      if (desktopPersistenceAvailable && desktopWriter) {
        const written = await desktopWriter(
          serialized,
          persistenceSessionId,
          revision,
        );
        if (!written) {
          throw new Error("Desktop workspace state rejected a stale persistence session.");
        }
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
      }
      markWorkspaceKeysPersisted(targetSnapshot, keyRevisions, revision);
      automaticWriteAttempts = 0;
      clearPersistenceFailure("workspace-write");
    } catch (error) {
      if (revision < lastCompletedRevision) {
        return;
      }
      dirty = dirtyKeys.size > 0;
      automaticWriteAttempts += 1;
      console.warn("[WorkspaceState] Failed to persist workspace state.", error);
      reportPersistenceFailure("workspace-write", error);
    }
  })();
  pendingWrite = write;
  await write;
  if (pendingWrite === write) {
    pendingWrite = null;
  }
  if (dirty && automaticWriteAttempts < MAX_AUTOMATIC_WRITE_ATTEMPTS) {
    scheduleWrite();
  }
}

export async function flushWorkspaceStateForShutdown() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await flushWorkspaceState();
    if (!pendingWrite && !dirty) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !pendingWrite && !dirty;
}

export function resetWorkspaceStateForTests() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  cachedWorkspaceState = {};
  lastPersistedWorkspaceState = {};
  initialized = false;
  dirty = false;
  desktopPersistenceAvailable = false;
  pendingWrite = null;
  writeRevision = 0;
  lastCompletedRevision = 0;
  mutationRevision = 0;
  automaticWriteAttempts = 0;
  dirtyKeys.clear();
  mutationRevisionByKey.clear();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushWorkspaceState();
    }
  });
}

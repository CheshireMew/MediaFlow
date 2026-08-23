import { getDesktopApi } from "../desktop";
import {
  clearPersistenceFailure,
  reportPersistenceFailure,
} from "./persistenceHealth";

type WorkspaceState = Record<string, unknown>;
type WorkspacePatchOperation =
  | { op: "set"; path: Array<string | number>; value: unknown }
  | { op: "delete"; path: Array<string | number> };

type WorkspacePatchEnvelope = {
  format: "mediaflow-workspace-patch-v1";
  operations: WorkspacePatchOperation[];
};

const WORKSPACE_STORAGE_KEY = "mediaflow:workspace-state:v1";
const WRITE_DEBOUNCE_MS = 250;

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
const dirtyKeys = new Set<string>();
const initializedListeners = new Set<() => void>();

function isRecord(value: unknown): value is WorkspaceState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  return { format: "mediaflow-workspace-patch-v1", operations };
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
  dirty = true;
  scheduleWrite();
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
  const targetSnapshot = cachedWorkspaceState;
  const keysToWrite = new Set(dirtyKeys);
  const patch = buildPatchEnvelope(targetSnapshot, keysToWrite);
  if (patch.operations.length === 0) {
    keysToWrite.forEach((key) => dirtyKeys.delete(key));
    dirty = dirtyKeys.size > 0;
    return;
  }
  const serialized = desktopPersistenceAvailable
    ? JSON.stringify(patch)
    : JSON.stringify(targetSnapshot);
  const revision = ++writeRevision;
  keysToWrite.forEach((key) => dirtyKeys.delete(key));
  dirty = false;
  pendingWrite = (async () => {
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
        lastPersistedWorkspaceState = targetSnapshot;
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
      }
      lastPersistedWorkspaceState = targetSnapshot;
      clearPersistenceFailure("workspace-write");
    } catch (error) {
      keysToWrite.forEach((key) => dirtyKeys.add(key));
      dirty = true;
      console.warn("[WorkspaceState] Failed to persist workspace state.", error);
      reportPersistenceFailure("workspace-write", error);
    }
  })();
  await pendingWrite;
  pendingWrite = null;
  if (dirty) {
    scheduleWrite();
  }
}

export function flushWorkspaceStateSynchronously() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!dirty) {
    return true;
  }

  const targetSnapshot = cachedWorkspaceState;
  const keysToWrite = new Set(dirtyKeys);
  const patch = buildPatchEnvelope(targetSnapshot, keysToWrite);
  if (patch.operations.length === 0) {
    keysToWrite.forEach((key) => dirtyKeys.delete(key));
    dirty = dirtyKeys.size > 0;
    return true;
  }
  const serialized = desktopPersistenceAvailable
    ? JSON.stringify(patch)
    : JSON.stringify(targetSnapshot);
  const revision = ++writeRevision;
  try {
    const desktopWriter = getDesktopApi()?.writeWorkspaceStateSync;
    if (desktopPersistenceAvailable && desktopWriter) {
      const written = desktopWriter(serialized, persistenceSessionId, revision);
      if (!written) {
        throw new Error("Desktop workspace state rejected the latest revision.");
      }
      lastPersistedWorkspaceState = targetSnapshot;
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    }
    lastPersistedWorkspaceState = targetSnapshot;
    keysToWrite.forEach((key) => dirtyKeys.delete(key));
    dirty = false;
    clearPersistenceFailure("workspace-write");
    return true;
  } catch (error) {
    keysToWrite.forEach((key) => dirtyKeys.add(key));
    dirty = true;
    console.warn("[WorkspaceState] Failed to synchronously persist workspace state.", error);
    reportPersistenceFailure("workspace-write", error);
    return false;
  }
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
  dirtyKeys.clear();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushWorkspaceStateSynchronously();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushWorkspaceState();
    }
  });
}

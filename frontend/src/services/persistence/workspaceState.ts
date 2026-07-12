import { getDesktopApi } from "../desktop";
import {
  clearPersistenceFailure,
  reportPersistenceFailure,
} from "./persistenceHealth";

type WorkspaceState = Record<string, unknown>;

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
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let dirty = false;
let desktopPersistenceAvailable = false;
let pendingWrite: Promise<void> | null = null;
let writeRevision = 0;
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
          cachedWorkspaceState = parsed;
        }
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
  if (dirty || (desktopPersistenceAvailable && Object.keys(cachedWorkspaceState).length > 0)) {
    dirty = true;
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
  const serialized = JSON.stringify(cachedWorkspaceState);
  const revision = ++writeRevision;
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
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
      }
      clearPersistenceFailure("workspace-write");
    } catch (error) {
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

  const serialized = JSON.stringify(cachedWorkspaceState);
  const revision = ++writeRevision;
  try {
    const desktopWriter = getDesktopApi()?.writeWorkspaceStateSync;
    if (desktopPersistenceAvailable && desktopWriter) {
      const written = desktopWriter(serialized, persistenceSessionId, revision);
      if (!written) {
        throw new Error("Desktop workspace state rejected the latest revision.");
      }
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    }
    dirty = false;
    clearPersistenceFailure("workspace-write");
    return true;
  } catch (error) {
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
  initialized = false;
  dirty = false;
  desktopPersistenceAvailable = false;
  pendingWrite = null;
  writeRevision = 0;
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

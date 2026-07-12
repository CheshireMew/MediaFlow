import {
  settingsService,
  type ResolvedUserSettings,
} from "../domain";
import {
  clearPersistenceFailure,
  reportPersistenceFailure,
} from "./persistenceHealth";

type UiState = Record<string, unknown>;

let initialized = false;
let cachedSettings: ResolvedUserSettings | null = null;
let cachedUiState: UiState = {};
let pendingWrite: Promise<void> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let pendingRemovals = new Set<string>();
const initializedListeners = new Set<() => void>();
const WRITE_DEBOUNCE_MS = 250;

function isRecord(value: unknown): value is UiState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUiState(value: unknown): UiState {
  return isRecord(value) ? { ...value } : {};
}

function normalizeSettings(settings: ResolvedUserSettings): ResolvedUserSettings {
  return {
    ...settings,
    ui_state: normalizeUiState(settings.ui_state),
  };
}

export function initializeUiStateSettings(settings: ResolvedUserSettings | null) {
  initialized = true;
  cachedSettings = settings ? normalizeSettings(settings) : null;
  cachedUiState = normalizeUiState(settings?.ui_state);
  for (const listener of initializedListeners) {
    listener();
  }
}

export function resetUiStateSettingsForTests() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  initialized = false;
  cachedSettings = null;
  cachedUiState = {};
  pendingWrite = null;
  dirty = false;
  pendingRemovals = new Set();
}

export function subscribeUiStateSettingsInitialized(listener: () => void) {
  initializedListeners.add(listener);
  if (initialized) {
    listener();
  }

  return () => {
    initializedListeners.delete(listener);
  };
}

export function readUiStateValue<T>(key: string): T | null {
  const value = cachedUiState[key];
  return value === undefined ? null : (value as T);
}

export function writeUiStateValue<T>(key: string, value: T | null) {
  if (value === null || value === undefined) {
    const nextUiState = { ...cachedUiState };
    delete nextUiState[key];
    cachedUiState = nextUiState;
    pendingRemovals.add(key);
  } else {
    cachedUiState = {
      ...cachedUiState,
      [key]: value,
    };
    pendingRemovals.delete(key);
  }

  if (!initialized) {
    return;
  }

  dirty = true;
  scheduleWrite();
}

function scheduleWrite() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
  }
  writeTimer = setTimeout(() => {
    void flushUiStateSettings();
  }, WRITE_DEBOUNCE_MS);
}

export async function flushUiStateSettings(options?: { keepalive?: boolean }) {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!initialized || !cachedSettings || !dirty) {
    return pendingWrite ?? Promise.resolve();
  }
  if (pendingWrite) {
    await pendingWrite;
    if (!dirty) {
      return;
    }
  }

  const updates = { ...cachedUiState };
  const removals = [...pendingRemovals];
  dirty = false;
  pendingRemovals.clear();

  pendingWrite = settingsService
    .patchUiState({ updates, remove: removals }, options)
    .then((updated) => {
      clearPersistenceFailure("preferences-write");
      if (updated) {
        const normalized = normalizeSettings(updated);
        cachedSettings = dirty
          ? { ...normalized, ui_state: cachedUiState }
          : normalized;
        if (!dirty) {
          cachedUiState = normalizeUiState(updated.ui_state);
        }
      }
    })
    .catch((error) => {
      dirty = true;
      for (const key of removals) {
        pendingRemovals.add(key);
      }
      console.warn("[UIState] Failed to persist UI state.", error);
      reportPersistenceFailure("preferences-write", error);
    })
    .finally(() => {
      pendingWrite = null;
      if (dirty) {
        scheduleWrite();
      }
    });

  await pendingWrite;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    void flushUiStateSettings({ keepalive: true });
  });
  window.addEventListener("pagehide", () => {
    void flushUiStateSettings({ keepalive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushUiStateSettings({ keepalive: true });
    }
  });
}

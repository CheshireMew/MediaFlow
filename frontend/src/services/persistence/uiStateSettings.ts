import type { UserSettings } from "../../types/api";
import { settingsService } from "../domain/settingsService";

type UiState = Record<string, unknown>;

let initialized = false;
let cachedSettings: UserSettings | null = null;
let cachedUiState: UiState = {};
let pendingWrite: Promise<void> = Promise.resolve();
const initializedListeners = new Set<() => void>();

function isRecord(value: unknown): value is UiState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUiState(value: unknown): UiState {
  return isRecord(value) ? { ...value } : {};
}

function normalizeSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    ui_state: normalizeUiState(settings.ui_state),
  };
}

export function initializeUiStateSettings(settings: UserSettings | null) {
  initialized = true;
  cachedSettings = settings ? normalizeSettings(settings) : null;
  cachedUiState = normalizeUiState(settings?.ui_state);
  for (const listener of initializedListeners) {
    listener();
  }
}

export function resetUiStateSettingsForTests() {
  initialized = false;
  cachedSettings = null;
  cachedUiState = {};
  pendingWrite = Promise.resolve();
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

export async function loadUiStateSettings(): Promise<UserSettings | null> {
  const settings = await settingsService.getSettings();
  initializeUiStateSettings(settings);
  return cachedSettings;
}

export function readUiStateValue<T>(key: string): T | null {
  const value = cachedUiState[key];
  return value === undefined ? null : (value as T);
}

export function writeUiStateValue<T>(key: string, value: T | null) {
  if (value === null || value === undefined) {
    const { [key]: _removed, ...nextUiState } = cachedUiState;
    cachedUiState = nextUiState;
  } else {
    cachedUiState = {
      ...cachedUiState,
      [key]: value,
    };
  }

  if (!initialized) {
    return;
  }

  pendingWrite = pendingWrite
    .then(async () => {
      const settings = await settingsService.getSettings().catch(() => cachedSettings);
      if (!settings) {
        return;
      }

      const updated = await settingsService.updateSettings({
        ...settings,
        ui_state: cachedUiState,
      });
      if (updated) {
        cachedSettings = normalizeSettings(updated);
        cachedUiState = normalizeUiState(updated.ui_state);
      }
    })
    .catch((error) => {
      console.warn("[UIState] Failed to persist UI state.", error);
    });
}

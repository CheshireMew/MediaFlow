import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";

export type AsrExecutionPreferences = {
  engine: "builtin" | "cli";
  model: string;
  device: string;
};

const ASR_EXECUTION_PREFERENCES_KEY = "asr_execution_preferences";
const ASR_EXECUTION_PREFERENCES_VERSION = 1;
const LEGACY_TRANSCRIBER_SNAPSHOT_KEY = "transcriber_snapshot";
const LEGACY_TRANSCRIBER_SNAPSHOT_VERSION = 1;

const DEFAULT_ASR_EXECUTION_PREFERENCES: AsrExecutionPreferences = {
  engine: "builtin",
  model: "base",
  device: "cpu",
};

type LegacyTranscriberSnapshotPayload = Partial<AsrExecutionPreferences>;

function normalizeAsrExecutionPreferences(
  payload: Partial<AsrExecutionPreferences> | null | undefined,
): AsrExecutionPreferences {
  return {
    engine: payload?.engine === "cli" ? "cli" : "builtin",
    model:
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model
        : DEFAULT_ASR_EXECUTION_PREFERENCES.model,
    device:
      typeof payload?.device === "string" && payload.device.trim()
        ? payload.device
        : DEFAULT_ASR_EXECUTION_PREFERENCES.device,
  };
}

export function persistStoredAsrExecutionPreferences(
  preferences: AsrExecutionPreferences,
) {
  localStorage.setItem(
    ASR_EXECUTION_PREFERENCES_KEY,
    serializeVersionedSnapshot(
      ASR_EXECUTION_PREFERENCES_VERSION,
      normalizeAsrExecutionPreferences(preferences),
    ),
  );
}

export function restoreStoredAsrExecutionPreferences(): AsrExecutionPreferences {
  const snapshot = parseVersionedSnapshot<AsrExecutionPreferences>(
    localStorage.getItem(ASR_EXECUTION_PREFERENCES_KEY),
    ASR_EXECUTION_PREFERENCES_VERSION,
  );

  if (snapshot) {
    return normalizeAsrExecutionPreferences(snapshot);
  }

  const legacySnapshot = parseVersionedSnapshot<LegacyTranscriberSnapshotPayload>(
    localStorage.getItem(LEGACY_TRANSCRIBER_SNAPSHOT_KEY),
    LEGACY_TRANSCRIBER_SNAPSHOT_VERSION,
  );
  const migratedPreferences = normalizeAsrExecutionPreferences(legacySnapshot);
  persistStoredAsrExecutionPreferences(migratedPreferences);
  return migratedPreferences;
}

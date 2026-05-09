import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";
import { readUiStateValue, writeUiStateValue } from "./uiStateSettings";
import { ASR_EXECUTION_PREFERENCES } from "../../contracts/runtimeContracts";

export type AsrExecutionPreferences = {
  engine: "builtin" | "cli";
  model: string;
  device: string;
};

const DEFAULT_ASR_EXECUTION_PREFERENCES: AsrExecutionPreferences = {
  engine: ASR_EXECUTION_PREFERENCES.defaults.engine,
  model: ASR_EXECUTION_PREFERENCES.defaults.model,
  device: ASR_EXECUTION_PREFERENCES.defaults.device,
};

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
  writeUiStateValue(
    ASR_EXECUTION_PREFERENCES.key,
    serializeVersionedSnapshot(
      ASR_EXECUTION_PREFERENCES.schema_version,
      normalizeAsrExecutionPreferences(preferences),
    ),
  );
}

export function restoreStoredAsrExecutionPreferences(): AsrExecutionPreferences {
  const snapshot = parseVersionedSnapshot<AsrExecutionPreferences>(
    readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key),
    ASR_EXECUTION_PREFERENCES.schema_version,
  );

  if (snapshot) {
    return normalizeAsrExecutionPreferences(snapshot);
  }

  return DEFAULT_ASR_EXECUTION_PREFERENCES;
}

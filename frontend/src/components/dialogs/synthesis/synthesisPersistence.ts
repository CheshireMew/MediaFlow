import {
  parseVersionedSnapshot,
  serializeVersionedSnapshot,
} from "../../../services/persistence/versionedSnapshot";

const SYNTHESIS_SETTINGS_SNAPSHOT_KEY = "synthesis_settings_snapshot";
const SYNTHESIS_SETTINGS_SNAPSHOT_VERSION = 1;

export type SynthesisSettingsSnapshot = {
  subtitleEnabled: boolean;
  watermarkEnabled: boolean;
  quality: "high" | "balanced" | "small";
  useGpu: boolean;
  targetResolution: string;
  lastOutputDir: string | null;
};

function readLegacyBoolean(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return fallback;
  }

  try {
    return JSON.parse(saved) as boolean;
  } catch {
    return fallback;
  }
}

function readLegacyQuality(): "high" | "balanced" | "small" {
  const saved = localStorage.getItem("synthesis_quality");
  return saved === "high" || saved === "balanced" || saved === "small"
    ? saved
    : "balanced";
}

function readLegacyGpuPreference(): boolean {
  const saved = localStorage.getItem("synthesis_use_gpu");
  return saved === null ? true : saved === "true";
}

function readLegacyTargetResolution(): string {
  return localStorage.getItem("synthesis_target_resolution") ?? "original";
}

function clearLegacySynthesisSettings() {
  [
    "synthesis_subtitleEnabled",
    "synthesis_watermarkEnabled",
    "synthesis_quality",
    "synthesis_use_gpu",
    "synthesis_target_resolution",
    "last_synthesis_dir",
  ].forEach((key) => {
    localStorage.removeItem(key);
  });
}

export function restoreSynthesisSettingsSnapshot(): SynthesisSettingsSnapshot {
  const snapshot = parseVersionedSnapshot<SynthesisSettingsSnapshot>(
    localStorage.getItem(SYNTHESIS_SETTINGS_SNAPSHOT_KEY),
    SYNTHESIS_SETTINGS_SNAPSHOT_VERSION,
  );
  if (snapshot) {
    clearLegacySynthesisSettings();
    return snapshot;
  }

  const migratedSnapshot = {
    subtitleEnabled: readLegacyBoolean("synthesis_subtitleEnabled", true),
    watermarkEnabled: readLegacyBoolean("synthesis_watermarkEnabled", true),
    quality: readLegacyQuality(),
    useGpu: readLegacyGpuPreference(),
    targetResolution: readLegacyTargetResolution(),
    lastOutputDir: localStorage.getItem("last_synthesis_dir"),
  } satisfies SynthesisSettingsSnapshot;

  localStorage.setItem(
    SYNTHESIS_SETTINGS_SNAPSHOT_KEY,
    serializeVersionedSnapshot(
      SYNTHESIS_SETTINGS_SNAPSHOT_VERSION,
      migratedSnapshot,
    ),
  );
  clearLegacySynthesisSettings();
  return migratedSnapshot;
}

export function persistSynthesisSettingsSnapshot(
  snapshot: SynthesisSettingsSnapshot,
) {
  localStorage.setItem(
    SYNTHESIS_SETTINGS_SNAPSHOT_KEY,
    serializeVersionedSnapshot(
      SYNTHESIS_SETTINGS_SNAPSHOT_VERSION,
      snapshot,
    ),
  );
}

export function updateSynthesisSettingsSnapshot(
  updates: Partial<SynthesisSettingsSnapshot>,
) {
  persistSynthesisSettingsSnapshot({
    ...restoreSynthesisSettingsSnapshot(),
    ...updates,
  });
}

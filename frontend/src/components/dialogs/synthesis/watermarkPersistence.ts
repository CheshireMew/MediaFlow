import {
  parseVersionedSnapshot,
  serializeVersionedSnapshot,
} from "../../../services/persistence/versionedSnapshot";

const WATERMARK_SNAPSHOT_KEY = "synthesis_watermark_snapshot";
const WATERMARK_SNAPSHOT_VERSION = 1;

export type WatermarkSnapshot = {
  wmScale: number;
  wmOpacity: number;
  wmPos: { x: number; y: number };
};

const DEFAULT_WATERMARK_SNAPSHOT: WatermarkSnapshot = {
  wmScale: 0.2,
  wmOpacity: 0.8,
  wmPos: { x: 0.5, y: 0.5 },
};

function clearLegacyWatermarkKeys() {
  ["wm_scale", "wm_opacity", "wm_pos"].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function readLegacyNumber(key: string, fallback: number) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return fallback;
  }

  const parsed = Number(saved);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readLegacyPos() {
  const saved = localStorage.getItem("wm_pos");
  if (!saved) {
    return { ...DEFAULT_WATERMARK_SNAPSHOT.wmPos };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<{ x: number; y: number }>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore malformed legacy state
  }

  return { ...DEFAULT_WATERMARK_SNAPSHOT.wmPos };
}

export function restoreWatermarkSnapshot(): WatermarkSnapshot {
  const snapshot = parseVersionedSnapshot<WatermarkSnapshot>(
    localStorage.getItem(WATERMARK_SNAPSHOT_KEY),
    WATERMARK_SNAPSHOT_VERSION,
  );
  if (snapshot) {
    clearLegacyWatermarkKeys();
    return snapshot;
  }

  const migratedSnapshot: WatermarkSnapshot = {
    wmScale: readLegacyNumber("wm_scale", DEFAULT_WATERMARK_SNAPSHOT.wmScale),
    wmOpacity: readLegacyNumber("wm_opacity", DEFAULT_WATERMARK_SNAPSHOT.wmOpacity),
    wmPos: readLegacyPos(),
  };

  persistWatermarkSnapshot(migratedSnapshot);
  clearLegacyWatermarkKeys();
  return migratedSnapshot;
}

export function persistWatermarkSnapshot(snapshot: WatermarkSnapshot) {
  localStorage.setItem(
    WATERMARK_SNAPSHOT_KEY,
    serializeVersionedSnapshot(WATERMARK_SNAPSHOT_VERSION, snapshot),
  );
}

export function updateWatermarkSnapshot(updates: Partial<WatermarkSnapshot>) {
  persistWatermarkSnapshot({
    ...restoreWatermarkSnapshot(),
    ...updates,
  });
}

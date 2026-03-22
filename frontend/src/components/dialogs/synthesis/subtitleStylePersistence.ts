import {
  parseVersionedSnapshot,
  serializeVersionedSnapshot,
} from "../../../services/persistence/versionedSnapshot";
import type { SubtitlePreset } from "./types";
import { DEFAULT_SUBTITLE_POSITION } from "./types";

const SUBTITLE_STYLE_SNAPSHOT_KEY = "synthesis_subtitle_style_snapshot";
const SUBTITLE_STYLE_SNAPSHOT_VERSION = 1;

export type SubtitleStyleSnapshot = {
  fontSize: number;
  fontColor: string;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  outlineSize: number;
  shadowSize: number;
  outlineColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  bgPadding: number;
  alignment: number;
  multilineAlign: "bottom" | "center" | "top";
  subPos: { x: number; y: number };
  customPresets: SubtitlePreset[];
};

const DEFAULT_SUBTITLE_STYLE_SNAPSHOT: SubtitleStyleSnapshot = {
  fontSize: 24,
  fontColor: "#FFFFFF",
  fontName: "Arial",
  isBold: false,
  isItalic: false,
  outlineSize: 2,
  shadowSize: 0,
  outlineColor: "#000000",
  bgEnabled: false,
  bgColor: "#000000",
  bgOpacity: 0.5,
  bgPadding: 5,
  alignment: 2,
  multilineAlign: "center",
  subPos: { ...DEFAULT_SUBTITLE_POSITION },
  customPresets: [],
};

function clearLegacySubtitleStyleKeys() {
  [
    "sub_fontName",
    "sub_bold",
    "sub_italic",
    "sub_outline",
    "sub_shadow",
    "sub_outlineColor",
    "sub_bgEnabled",
    "sub_bgColor",
    "sub_bgOpacity",
    "sub_bgPadding",
    "sub_alignment",
    "sub_multilineAlign",
    "sub_fontSize",
    "sub_fontColor",
    "sub_pos",
    "sub_customPresets",
  ].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function readLegacyBoolean(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return fallback;
  }

  return saved === "true";
}

function readLegacyNumber(key: string, fallback: number) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return fallback;
  }

  const parsed = Number(saved);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readLegacyString(key: string, fallback: string) {
  return localStorage.getItem(key) ?? fallback;
}

function readLegacySubPos() {
  const saved = localStorage.getItem("sub_pos");
  if (!saved) {
    return { ...DEFAULT_SUBTITLE_POSITION };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<{ x: number; y: number }>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore malformed legacy state
  }

  return { ...DEFAULT_SUBTITLE_POSITION };
}

function readLegacyCustomPresets(): SubtitlePreset[] {
  const saved = localStorage.getItem("sub_customPresets");
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as SubtitlePreset[]) : [];
  } catch {
    return [];
  }
}

export function restoreSubtitleStyleSnapshot(): SubtitleStyleSnapshot {
  const snapshot = parseVersionedSnapshot<SubtitleStyleSnapshot>(
    localStorage.getItem(SUBTITLE_STYLE_SNAPSHOT_KEY),
    SUBTITLE_STYLE_SNAPSHOT_VERSION,
  );
  if (snapshot) {
    clearLegacySubtitleStyleKeys();
    return snapshot;
  }

  const migratedSnapshot: SubtitleStyleSnapshot = {
    fontSize: readLegacyNumber("sub_fontSize", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.fontSize),
    fontColor: readLegacyString("sub_fontColor", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.fontColor),
    fontName: readLegacyString("sub_fontName", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.fontName),
    isBold: readLegacyBoolean("sub_bold", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.isBold),
    isItalic: readLegacyBoolean("sub_italic", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.isItalic),
    outlineSize: readLegacyNumber("sub_outline", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.outlineSize),
    shadowSize: readLegacyNumber("sub_shadow", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.shadowSize),
    outlineColor: readLegacyString("sub_outlineColor", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.outlineColor),
    bgEnabled: readLegacyBoolean("sub_bgEnabled", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.bgEnabled),
    bgColor: readLegacyString("sub_bgColor", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.bgColor),
    bgOpacity: readLegacyNumber("sub_bgOpacity", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.bgOpacity),
    bgPadding: readLegacyNumber("sub_bgPadding", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.bgPadding),
    alignment: readLegacyNumber("sub_alignment", DEFAULT_SUBTITLE_STYLE_SNAPSHOT.alignment),
    multilineAlign: (() => {
      const saved = localStorage.getItem("sub_multilineAlign");
      return saved === "bottom" || saved === "center" || saved === "top"
        ? saved
        : DEFAULT_SUBTITLE_STYLE_SNAPSHOT.multilineAlign;
    })(),
    subPos: readLegacySubPos(),
    customPresets: readLegacyCustomPresets(),
  };

  persistSubtitleStyleSnapshot(migratedSnapshot);
  clearLegacySubtitleStyleKeys();
  return migratedSnapshot;
}

export function persistSubtitleStyleSnapshot(snapshot: SubtitleStyleSnapshot) {
  localStorage.setItem(
    SUBTITLE_STYLE_SNAPSHOT_KEY,
    serializeVersionedSnapshot(SUBTITLE_STYLE_SNAPSHOT_VERSION, snapshot),
  );
}

export function updateSubtitleStyleSnapshot(
  updates: Partial<SubtitleStyleSnapshot>,
) {
  persistSubtitleStyleSnapshot({
    ...restoreSubtitleStyleSnapshot(),
    ...updates,
  });
}

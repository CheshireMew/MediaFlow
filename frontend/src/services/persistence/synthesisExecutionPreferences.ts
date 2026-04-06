import { DEFAULT_SUBTITLE_POSITION, type SubtitlePreset } from "../../components/dialogs/synthesis/types";
import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";

export type SynthesisQuality = "high" | "balanced" | "small";

export type SynthesisSubtitleStylePreferences = {
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

export type SynthesisWatermarkPreferences = {
  wmScale: number;
  wmOpacity: number;
  wmPos: { x: number; y: number };
};

export type SynthesisExecutionPreferences = {
  subtitleEnabled: boolean;
  watermarkEnabled: boolean;
  quality: SynthesisQuality;
  useGpu: boolean;
  lastOutputDir: string | null;
  subtitleStyle: SynthesisSubtitleStylePreferences;
  watermark: SynthesisWatermarkPreferences;
};

export type SynthesisExecutionPreferencesUpdate = Partial<
  Omit<SynthesisExecutionPreferences, "subtitleStyle" | "watermark">
> & {
  subtitleStyle?: Partial<SynthesisSubtitleStylePreferences>;
  watermark?: Partial<SynthesisWatermarkPreferences>;
};

const SYNTHESIS_EXECUTION_PREFERENCES_KEY = "synthesis_execution_preferences";
const SYNTHESIS_EXECUTION_PREFERENCES_VERSION = 1;

const LEGACY_SYNTHESIS_SETTINGS_SNAPSHOT_KEY = "synthesis_settings_snapshot";
const LEGACY_SUBTITLE_STYLE_SNAPSHOT_KEY = "synthesis_subtitle_style_snapshot";
const LEGACY_WATERMARK_SNAPSHOT_KEY = "synthesis_watermark_snapshot";

const LEGACY_BOOLEAN_KEYS = [
  "synthesis_subtitleEnabled",
  "synthesis_watermarkEnabled",
] as const;
const LEGACY_SYNTHESIS_KEYS = [
  ...LEGACY_BOOLEAN_KEYS,
  "synthesis_quality",
  "synthesis_use_gpu",
  "synthesis_target_resolution",
  "last_synthesis_dir",
] as const;
const LEGACY_SUBTITLE_STYLE_KEYS = [
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
] as const;
const LEGACY_WATERMARK_KEYS = ["wm_scale", "wm_opacity", "wm_pos"] as const;

const DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES: SynthesisExecutionPreferences = {
  subtitleEnabled: true,
  watermarkEnabled: true,
  quality: "balanced",
  useGpu: true,
  lastOutputDir: null,
  subtitleStyle: {
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
  },
  watermark: {
    wmScale: 0.2,
    wmOpacity: 0.8,
    wmPos: { x: 0.5, y: 0.5 },
  },
};

function clearLegacySynthesisExecutionKeys() {
  [
    LEGACY_SYNTHESIS_SETTINGS_SNAPSHOT_KEY,
    LEGACY_SUBTITLE_STYLE_SNAPSHOT_KEY,
    LEGACY_WATERMARK_SNAPSHOT_KEY,
    ...LEGACY_SYNTHESIS_KEYS,
    ...LEGACY_SUBTITLE_STYLE_KEYS,
    ...LEGACY_WATERMARK_KEYS,
  ].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function readLegacyBoolean(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return fallback;
  }

  try {
    return JSON.parse(saved) as boolean;
  } catch {
    return saved === "true";
  }
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

function readLegacySubtitlePosition() {
  const saved = localStorage.getItem("sub_pos");
  if (!saved) {
    return { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.subPos };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<{ x: number; y: number }>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore malformed legacy state
  }

  return { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.subPos };
}

function readLegacyWatermarkPosition() {
  const saved = localStorage.getItem("wm_pos");
  if (!saved) {
    return { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmPos };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<{ x: number; y: number }>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore malformed legacy state
  }

  return { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmPos };
}

function readLegacyCustomPresets() {
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

function normalizeSubtitleStylePreferences(
  payload: Partial<SynthesisSubtitleStylePreferences> | null | undefined,
): SynthesisSubtitleStylePreferences {
  return {
    fontSize:
      typeof payload?.fontSize === "number" && Number.isFinite(payload.fontSize)
        ? payload.fontSize
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontSize,
    fontColor:
      typeof payload?.fontColor === "string" && payload.fontColor
        ? payload.fontColor
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontColor,
    fontName:
      typeof payload?.fontName === "string" && payload.fontName
        ? payload.fontName
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontName,
    isBold:
      typeof payload?.isBold === "boolean"
        ? payload.isBold
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.isBold,
    isItalic:
      typeof payload?.isItalic === "boolean"
        ? payload.isItalic
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.isItalic,
    outlineSize:
      typeof payload?.outlineSize === "number" && Number.isFinite(payload.outlineSize)
        ? payload.outlineSize
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.outlineSize,
    shadowSize:
      typeof payload?.shadowSize === "number" && Number.isFinite(payload.shadowSize)
        ? payload.shadowSize
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.shadowSize,
    outlineColor:
      typeof payload?.outlineColor === "string" && payload.outlineColor
        ? payload.outlineColor
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.outlineColor,
    bgEnabled:
      typeof payload?.bgEnabled === "boolean"
        ? payload.bgEnabled
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgEnabled,
    bgColor:
      typeof payload?.bgColor === "string" && payload.bgColor
        ? payload.bgColor
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgColor,
    bgOpacity:
      typeof payload?.bgOpacity === "number" && Number.isFinite(payload.bgOpacity)
        ? payload.bgOpacity
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgOpacity,
    bgPadding:
      typeof payload?.bgPadding === "number" && Number.isFinite(payload.bgPadding)
        ? payload.bgPadding
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgPadding,
    alignment:
      typeof payload?.alignment === "number" && Number.isFinite(payload.alignment)
        ? payload.alignment
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.alignment,
    multilineAlign:
      payload?.multilineAlign === "bottom" ||
      payload?.multilineAlign === "center" ||
      payload?.multilineAlign === "top"
        ? payload.multilineAlign
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.multilineAlign,
    subPos:
      payload?.subPos &&
      typeof payload.subPos.x === "number" &&
      typeof payload.subPos.y === "number"
        ? { x: payload.subPos.x, y: payload.subPos.y }
        : { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.subPos },
    customPresets: Array.isArray(payload?.customPresets) ? payload.customPresets : [],
  };
}

function normalizeWatermarkPreferences(
  payload: Partial<SynthesisWatermarkPreferences> | null | undefined,
): SynthesisWatermarkPreferences {
  return {
    wmScale:
      typeof payload?.wmScale === "number" && Number.isFinite(payload.wmScale)
        ? payload.wmScale
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmScale,
    wmOpacity:
      typeof payload?.wmOpacity === "number" && Number.isFinite(payload.wmOpacity)
        ? payload.wmOpacity
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmOpacity,
    wmPos:
      payload?.wmPos &&
      typeof payload.wmPos.x === "number" &&
      typeof payload.wmPos.y === "number"
        ? { x: payload.wmPos.x, y: payload.wmPos.y }
        : { ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmPos },
  };
}

function normalizeSynthesisExecutionPreferences(
  payload: Partial<SynthesisExecutionPreferences> | null | undefined,
): SynthesisExecutionPreferences {
  return {
    subtitleEnabled:
      typeof payload?.subtitleEnabled === "boolean"
        ? payload.subtitleEnabled
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleEnabled,
    watermarkEnabled:
      typeof payload?.watermarkEnabled === "boolean"
        ? payload.watermarkEnabled
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermarkEnabled,
    quality:
      payload?.quality === "high" ||
      payload?.quality === "balanced" ||
      payload?.quality === "small"
        ? payload.quality
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.quality,
    useGpu:
      typeof payload?.useGpu === "boolean"
        ? payload.useGpu
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.useGpu,
    lastOutputDir:
      typeof payload?.lastOutputDir === "string" ? payload.lastOutputDir : null,
    subtitleStyle: normalizeSubtitleStylePreferences(payload?.subtitleStyle),
    watermark: normalizeWatermarkPreferences(payload?.watermark),
  };
}

function restoreLegacySynthesisSettings() {
  const snapshot = parseVersionedSnapshot<{
    subtitleEnabled: boolean;
    watermarkEnabled: boolean;
    quality: SynthesisQuality;
    useGpu: boolean;
    lastOutputDir: string | null;
  }>(localStorage.getItem(LEGACY_SYNTHESIS_SETTINGS_SNAPSHOT_KEY), 1);

  if (snapshot) {
    return snapshot;
  }

  return {
    subtitleEnabled: readLegacyBoolean(
      "synthesis_subtitleEnabled",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleEnabled,
    ),
    watermarkEnabled: readLegacyBoolean(
      "synthesis_watermarkEnabled",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermarkEnabled,
    ),
    quality: (() => {
      const saved = localStorage.getItem("synthesis_quality");
      return saved === "high" || saved === "balanced" || saved === "small"
        ? saved
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.quality;
    })(),
    useGpu:
      localStorage.getItem("synthesis_use_gpu") === null
        ? DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.useGpu
        : localStorage.getItem("synthesis_use_gpu") === "true",
    lastOutputDir: localStorage.getItem("last_synthesis_dir"),
  };
}

function restoreLegacySubtitleStyle() {
  const snapshot = parseVersionedSnapshot<SynthesisSubtitleStylePreferences>(
    localStorage.getItem(LEGACY_SUBTITLE_STYLE_SNAPSHOT_KEY),
    1,
  );

  if (snapshot) {
    return snapshot;
  }

  return {
    fontSize: readLegacyNumber(
      "sub_fontSize",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontSize,
    ),
    fontColor: readLegacyString(
      "sub_fontColor",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontColor,
    ),
    fontName: readLegacyString(
      "sub_fontName",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.fontName,
    ),
    isBold: readLegacyBoolean(
      "sub_bold",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.isBold,
    ),
    isItalic: readLegacyBoolean(
      "sub_italic",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.isItalic,
    ),
    outlineSize: readLegacyNumber(
      "sub_outline",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.outlineSize,
    ),
    shadowSize: readLegacyNumber(
      "sub_shadow",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.shadowSize,
    ),
    outlineColor: readLegacyString(
      "sub_outlineColor",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.outlineColor,
    ),
    bgEnabled: readLegacyBoolean(
      "sub_bgEnabled",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgEnabled,
    ),
    bgColor: readLegacyString(
      "sub_bgColor",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgColor,
    ),
    bgOpacity: readLegacyNumber(
      "sub_bgOpacity",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgOpacity,
    ),
    bgPadding: readLegacyNumber(
      "sub_bgPadding",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.bgPadding,
    ),
    alignment: readLegacyNumber(
      "sub_alignment",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.alignment,
    ),
    multilineAlign: (() => {
      const saved = localStorage.getItem("sub_multilineAlign");
      return saved === "bottom" || saved === "center" || saved === "top"
        ? saved
        : DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle.multilineAlign;
    })(),
    subPos: readLegacySubtitlePosition(),
    customPresets: readLegacyCustomPresets(),
  };
}

function restoreLegacyWatermark() {
  const snapshot = parseVersionedSnapshot<SynthesisWatermarkPreferences>(
    localStorage.getItem(LEGACY_WATERMARK_SNAPSHOT_KEY),
    1,
  );

  if (snapshot) {
    return snapshot;
  }

  return {
    wmScale: readLegacyNumber(
      "wm_scale",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmScale,
    ),
    wmOpacity: readLegacyNumber(
      "wm_opacity",
      DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmOpacity,
    ),
    wmPos: readLegacyWatermarkPosition(),
  };
}

export function persistStoredSynthesisExecutionPreferences(
  preferences: SynthesisExecutionPreferences,
) {
  localStorage.setItem(
    SYNTHESIS_EXECUTION_PREFERENCES_KEY,
    serializeVersionedSnapshot(
      SYNTHESIS_EXECUTION_PREFERENCES_VERSION,
      normalizeSynthesisExecutionPreferences(preferences),
    ),
  );
}

export function restoreStoredSynthesisExecutionPreferences(): SynthesisExecutionPreferences {
  const snapshot = parseVersionedSnapshot<SynthesisExecutionPreferences>(
    localStorage.getItem(SYNTHESIS_EXECUTION_PREFERENCES_KEY),
    SYNTHESIS_EXECUTION_PREFERENCES_VERSION,
  );

  if (snapshot) {
    clearLegacySynthesisExecutionKeys();
    return normalizeSynthesisExecutionPreferences(snapshot);
  }

  const migratedPreferences = normalizeSynthesisExecutionPreferences({
    ...restoreLegacySynthesisSettings(),
    subtitleStyle: restoreLegacySubtitleStyle(),
    watermark: restoreLegacyWatermark(),
  });
  persistStoredSynthesisExecutionPreferences(migratedPreferences);
  clearLegacySynthesisExecutionKeys();
  return migratedPreferences;
}

export function mergeSynthesisExecutionPreferences(
  currentPreferences: SynthesisExecutionPreferences,
  updates: SynthesisExecutionPreferencesUpdate,
): SynthesisExecutionPreferences {
  return normalizeSynthesisExecutionPreferences({
    ...currentPreferences,
    ...updates,
    subtitleStyle: updates.subtitleStyle
      ? {
          ...currentPreferences.subtitleStyle,
          ...updates.subtitleStyle,
        }
      : currentPreferences.subtitleStyle,
    watermark: updates.watermark
      ? {
          ...currentPreferences.watermark,
          ...updates.watermark,
        }
      : currentPreferences.watermark,
  });
}

export function updateStoredSynthesisExecutionPreferences(
  updates: SynthesisExecutionPreferencesUpdate,
) {
  const currentPreferences = restoreStoredSynthesisExecutionPreferences();
  persistStoredSynthesisExecutionPreferences(
    mergeSynthesisExecutionPreferences(currentPreferences, updates),
  );
}

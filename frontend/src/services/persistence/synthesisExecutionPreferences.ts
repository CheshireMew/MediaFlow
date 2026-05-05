import { DEFAULT_SUBTITLE_POSITION } from "../domain/synthesis/types";
import type { PersistedSubtitleStyleValues } from "../domain/synthesis/styleTypes";
import { readUiStateValue, writeUiStateValue } from "./uiStateSettings";
import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";

export type SynthesisQuality = "high" | "balanced" | "small";

export type SynthesisSubtitleStylePreferences = PersistedSubtitleStyleValues;

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

export const DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES: SynthesisExecutionPreferences = {
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

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function normalizeSubtitleStylePreferences(
  payload: Partial<SynthesisSubtitleStylePreferences> | null | undefined,
): SynthesisSubtitleStylePreferences {
  const defaults = DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle;
  return {
    fontSize: finiteNumber(payload?.fontSize, defaults.fontSize),
    fontColor: nonEmptyString(payload?.fontColor, defaults.fontColor),
    fontName: nonEmptyString(payload?.fontName, defaults.fontName),
    isBold: typeof payload?.isBold === "boolean" ? payload.isBold : defaults.isBold,
    isItalic: typeof payload?.isItalic === "boolean" ? payload.isItalic : defaults.isItalic,
    outlineSize: finiteNumber(payload?.outlineSize, defaults.outlineSize),
    shadowSize: finiteNumber(payload?.shadowSize, defaults.shadowSize),
    outlineColor: nonEmptyString(payload?.outlineColor, defaults.outlineColor),
    bgEnabled: typeof payload?.bgEnabled === "boolean" ? payload.bgEnabled : defaults.bgEnabled,
    bgColor: nonEmptyString(payload?.bgColor, defaults.bgColor),
    bgOpacity: finiteNumber(payload?.bgOpacity, defaults.bgOpacity),
    bgPadding: finiteNumber(payload?.bgPadding, defaults.bgPadding),
    alignment: finiteNumber(payload?.alignment, defaults.alignment),
    multilineAlign:
      payload?.multilineAlign === "bottom" ||
      payload?.multilineAlign === "center" ||
      payload?.multilineAlign === "top"
        ? payload.multilineAlign
        : defaults.multilineAlign,
    subPos:
      payload?.subPos &&
      typeof payload.subPos.x === "number" &&
      typeof payload.subPos.y === "number"
        ? { x: payload.subPos.x, y: payload.subPos.y }
        : { ...defaults.subPos },
    customPresets: Array.isArray(payload?.customPresets) ? payload.customPresets : [],
  };
}

function normalizeWatermarkPreferences(
  payload: Partial<SynthesisWatermarkPreferences> | null | undefined,
): SynthesisWatermarkPreferences {
  const defaults = DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark;
  return {
    wmScale: finiteNumber(payload?.wmScale, defaults.wmScale),
    wmOpacity: finiteNumber(payload?.wmOpacity, defaults.wmOpacity),
    wmPos:
      payload?.wmPos &&
      typeof payload.wmPos.x === "number" &&
      typeof payload.wmPos.y === "number"
        ? { x: payload.wmPos.x, y: payload.wmPos.y }
        : { ...defaults.wmPos },
  };
}

function normalizeSynthesisExecutionPreferences(
  payload: Partial<SynthesisExecutionPreferences> | null | undefined,
): SynthesisExecutionPreferences {
  const defaults = DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES;
  return {
    subtitleEnabled:
      typeof payload?.subtitleEnabled === "boolean" ? payload.subtitleEnabled : defaults.subtitleEnabled,
    watermarkEnabled:
      typeof payload?.watermarkEnabled === "boolean" ? payload.watermarkEnabled : defaults.watermarkEnabled,
    quality:
      payload?.quality === "high" ||
      payload?.quality === "balanced" ||
      payload?.quality === "small"
        ? payload.quality
        : defaults.quality,
    useGpu: typeof payload?.useGpu === "boolean" ? payload.useGpu : defaults.useGpu,
    lastOutputDir: typeof payload?.lastOutputDir === "string" ? payload.lastOutputDir : null,
    subtitleStyle: normalizeSubtitleStylePreferences(payload?.subtitleStyle),
    watermark: normalizeWatermarkPreferences(payload?.watermark),
  };
}

export function persistStoredSynthesisExecutionPreferences(
  preferences: SynthesisExecutionPreferences,
) {
  writeUiStateValue(
    SYNTHESIS_EXECUTION_PREFERENCES_KEY,
    serializeVersionedSnapshot(
      SYNTHESIS_EXECUTION_PREFERENCES_VERSION,
      normalizeSynthesisExecutionPreferences(preferences),
    ),
  );
}

export function restoreStoredSynthesisExecutionPreferences(): SynthesisExecutionPreferences {
  return normalizeSynthesisExecutionPreferences(
    parseVersionedSnapshot<SynthesisExecutionPreferences>(
      readUiStateValue<string>(SYNTHESIS_EXECUTION_PREFERENCES_KEY),
      SYNTHESIS_EXECUTION_PREFERENCES_VERSION,
    ),
  );
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

import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";
import { readUiStateValue, writeUiStateValue } from "./uiStateSettings";

export type TranslationExecutionMode = "standard" | "intelligent" | "proofread";

export type TranslationPreferences = {
  targetLanguage: string;
  mode: TranslationExecutionMode;
};

const TRANSLATION_PREFERENCES_KEY = "translation_preferences";
const TRANSLATION_PREFERENCES_VERSION = 2;

const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  targetLanguage: "Chinese",
  mode: "standard",
};

function normalizeTranslationPreferences(
  payload: Partial<TranslationPreferences> | null | undefined,
): TranslationPreferences {
  return {
    targetLanguage:
      typeof payload?.targetLanguage === "string" && payload.targetLanguage.trim()
        ? payload.targetLanguage
        : DEFAULT_TRANSLATION_PREFERENCES.targetLanguage,
    mode:
      payload?.mode === "standard" ||
      payload?.mode === "intelligent" ||
      payload?.mode === "proofread"
        ? payload.mode
        : DEFAULT_TRANSLATION_PREFERENCES.mode,
  };
}

export function persistStoredTranslationPreferences(
  preferences: TranslationPreferences,
) {
  writeUiStateValue(
    TRANSLATION_PREFERENCES_KEY,
    serializeVersionedSnapshot(
      TRANSLATION_PREFERENCES_VERSION,
      normalizeTranslationPreferences(preferences),
    ),
  );
}

export function restoreStoredTranslationPreferences(): TranslationPreferences {
  const snapshot = parseVersionedSnapshot<TranslationPreferences>(
    readUiStateValue<string>(TRANSLATION_PREFERENCES_KEY),
    TRANSLATION_PREFERENCES_VERSION,
  );

  if (snapshot) {
    return normalizeTranslationPreferences(snapshot);
  }

  return DEFAULT_TRANSLATION_PREFERENCES;
}

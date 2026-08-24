import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";
import { readUiStateValue, writeUiStateValue } from "./uiStateSettings";
import {
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  normalizeTranslationTargetLanguage,
  type TranslationTargetLanguage,
} from "../domain/translationTargetLanguages";

export type TranslationPreferenceMode = "standard" | "intelligent";
export type TranslationExecutionMode = TranslationPreferenceMode | "proofread";

export type TranslationPreferences = {
  targetLanguage: TranslationTargetLanguage;
  mode: TranslationPreferenceMode;
};

const TRANSLATION_PREFERENCES_KEY = "translation_preferences";
const TRANSLATION_PREFERENCES_VERSION = 2;

const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  targetLanguage: DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  mode: "standard",
};

function normalizeTranslationPreferences(
  payload: Partial<TranslationPreferences> | null | undefined,
): TranslationPreferences {
  return {
    targetLanguage: normalizeTranslationTargetLanguage(payload?.targetLanguage),
    mode:
      payload?.mode === "standard" ||
      payload?.mode === "intelligent"
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

import { parseVersionedSnapshot, serializeVersionedSnapshot } from "./versionedSnapshot";

export type TranslationExecutionMode = "standard" | "intelligent" | "proofread";

export type TranslationPreferences = {
  targetLanguage: string;
  mode: TranslationExecutionMode;
};

const TRANSLATION_PREFERENCES_KEY = "translation_preferences";
const TRANSLATION_PREFERENCES_VERSION = 2;
const LEGACY_TRANSLATOR_STORE_KEY = "translator-storage";

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

function restoreLegacyTranslatorPreferences(): Partial<TranslationPreferences> | null {
  const raw = localStorage.getItem(LEGACY_TRANSLATOR_STORE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        targetLang?: unknown;
        mode?: unknown;
      };
    };
    const targetLang = parsed?.state?.targetLang;
    const mode = parsed?.state?.mode;
    return {
      targetLanguage:
        typeof targetLang === "string" && targetLang.trim() ? targetLang : undefined,
      mode:
        mode === "standard" || mode === "intelligent" || mode === "proofread"
          ? mode
          : undefined,
    };
  } catch {
    return null;
  }
}

function restoreLegacyTranslationPreferencesSnapshot():
  | Partial<TranslationPreferences>
  | null {
  const raw = localStorage.getItem(TRANSLATION_PREFERENCES_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      schema_version?: unknown;
      payload?: {
        targetLanguage?: unknown;
        mode?: unknown;
      };
    };
    if (parsed?.schema_version !== 1 || !parsed.payload) {
      return null;
    }

    return {
      targetLanguage:
        typeof parsed.payload.targetLanguage === "string"
          ? parsed.payload.targetLanguage
          : undefined,
      mode:
        parsed.payload.mode === "standard" ||
        parsed.payload.mode === "intelligent" ||
        parsed.payload.mode === "proofread"
          ? parsed.payload.mode
          : undefined,
    };
  } catch {
    return null;
  }
}

export function persistStoredTranslationPreferences(
  preferences: TranslationPreferences,
) {
  localStorage.setItem(
    TRANSLATION_PREFERENCES_KEY,
    serializeVersionedSnapshot(
      TRANSLATION_PREFERENCES_VERSION,
      normalizeTranslationPreferences(preferences),
    ),
  );
}

export function restoreStoredTranslationPreferences(): TranslationPreferences {
  const snapshot = parseVersionedSnapshot<TranslationPreferences>(
    localStorage.getItem(TRANSLATION_PREFERENCES_KEY),
    TRANSLATION_PREFERENCES_VERSION,
  );

  if (snapshot) {
    return normalizeTranslationPreferences(snapshot);
  }

  const migratedPreferences = normalizeTranslationPreferences({
    ...restoreLegacyTranslationPreferencesSnapshot(),
    ...restoreLegacyTranslatorPreferences(),
  });
  persistStoredTranslationPreferences(migratedPreferences);
  return migratedPreferences;
}

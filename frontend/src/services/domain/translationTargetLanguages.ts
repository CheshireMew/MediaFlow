export const TRANSLATION_TARGET_LANGUAGES = [
  { value: "SimplifiedChinese", labelKey: "languages.SimplifiedChinese", suffix: "_ZH-CN" },
  { value: "TraditionalChinese", labelKey: "languages.TraditionalChinese", suffix: "_ZH-TW" },
  { value: "English", labelKey: "languages.English", suffix: "_EN" },
  { value: "Japanese", labelKey: "languages.Japanese", suffix: "_JP" },
  { value: "Spanish", labelKey: "languages.Spanish", suffix: "_ES" },
  { value: "French", labelKey: "languages.French", suffix: "_FR" },
  { value: "German", labelKey: "languages.German", suffix: "_DE" },
  { value: "Russian", labelKey: "languages.Russian", suffix: "_RU" },
] as const;

export type TranslationTargetLanguage =
  (typeof TRANSLATION_TARGET_LANGUAGES)[number]["value"];

export const DEFAULT_TRANSLATION_TARGET_LANGUAGE: TranslationTargetLanguage =
  "SimplifiedChinese";

const TRANSLATION_TARGET_LANGUAGE_VALUES = new Set<string>(
  TRANSLATION_TARGET_LANGUAGES.map(({ value }) => value),
);

export function isTranslationTargetLanguage(
  value: unknown,
): value is TranslationTargetLanguage {
  return typeof value === "string" && TRANSLATION_TARGET_LANGUAGE_VALUES.has(value);
}

export function normalizeTranslationTargetLanguage(
  value: unknown,
): TranslationTargetLanguage {
  return isTranslationTargetLanguage(value)
    ? value
    : DEFAULT_TRANSLATION_TARGET_LANGUAGE;
}

export function getTranslationTargetLanguageSuffix(
  targetLanguage: TranslationTargetLanguage,
): string {
  return TRANSLATION_TARGET_LANGUAGES.find(({ value }) => value === targetLanguage)!.suffix;
}

export function getTranslationTargetLanguageBySuffix(
  suffix: string,
): TranslationTargetLanguage | null {
  return TRANSLATION_TARGET_LANGUAGES.find((language) => language.suffix === suffix)
    ?.value ?? null;
}

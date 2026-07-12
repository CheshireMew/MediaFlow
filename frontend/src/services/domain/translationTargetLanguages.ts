import {
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGES,
} from "../../contracts/generatedTranslationTargetLanguages";
import type { TranslationTargetLanguage } from "../../contracts/generatedTranslationTargetLanguages";

export {
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGES,
};
export type { TranslationTargetLanguage };

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

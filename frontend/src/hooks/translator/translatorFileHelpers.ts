import { isDesktopRuntime } from "../../services/domain";
import { parseSubtitleContent } from "../../utils/subtitleParser";
import { fileService } from "../../services/fileService";
import {
  TRANSLATION_TARGET_LANGUAGES,
  getTranslationTargetLanguageSuffix,
  type TranslationTargetLanguage,
} from "../../services/domain/translationTargetLanguages";

export const TRANSLATOR_SUBTITLE_EXTENSIONS = [
  ".srt",
  ".vtt",
  ".ass",
  ".ssa",
];

export function isSupportedTranslatorSubtitlePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return TRANSLATOR_SUBTITLE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export function stripTranslatorSubtitleExtension(path: string): string {
  const normalized = path.toLowerCase();
  const extension = TRANSLATOR_SUBTITLE_EXTENSIONS.find((ext) =>
    normalized.endsWith(ext),
  );
  return extension ? path.slice(0, -extension.length) : path;
}

export function getTranslatorOutputSuffix(
  targetLang: TranslationTargetLanguage,
  mode: "standard" | "intelligent" | "proofread",
): string {
  if (mode === "proofread") return "_PR";
  return getTranslationTargetLanguageSuffix(targetLang);
}

export function getTranslatorAutoloadSuffixes(
  targetLang: TranslationTargetLanguage,
  mode: "standard" | "intelligent" | "proofread",
): string[] {
  const preferred = getTranslatorOutputSuffix(targetLang, mode);
  const languageSuffixes = TRANSLATION_TARGET_LANGUAGES.map(({ suffix }) => suffix);
  const ordered = [preferred, ...languageSuffixes];
  if (mode === "proofread") {
    ordered.push("_PR");
  }
  return [...new Set(ordered)];
}

export async function loadTranslatorSubtitle(path: string) {
  if (!isDesktopRuntime()) return null;
  const content = await fileService.readFile(path);
  if (!content) {
    throw new Error("File content is empty");
  }
  return parseSubtitleContent(content, path);
}

export const formatTranslatorTimestamp = (seconds: number) => {
  const date = new Date(0);
  date.setMilliseconds(Math.round(seconds * 1000));
  const iso = date.toISOString();
  return iso.substring(11, 23).replace(".", ",");
};

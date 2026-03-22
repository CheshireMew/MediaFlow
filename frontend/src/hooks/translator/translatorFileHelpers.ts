import { isDesktopRuntime } from "../../services/domain";
import { parseSubtitleContent } from "../../utils/subtitleParser";
import { fileService } from "../../services/fileService";

export const TRANSLATOR_SUBTITLE_EXTENSIONS = [
  ".srt",
  ".vtt",
  ".ass",
  ".ssa",
];

export const TRANSLATOR_LANGUAGE_SUFFIX_MAP: Record<string, string> = {
  Chinese: "_CN",
  English: "_EN",
  Japanese: "_JP",
  Spanish: "_ES",
  French: "_FR",
  German: "_DE",
  Russian: "_RU",
};

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
  targetLang: string,
  mode: "standard" | "intelligent" | "proofread",
): string {
  if (mode === "proofread") return "_PR";
  return TRANSLATOR_LANGUAGE_SUFFIX_MAP[targetLang] || "_CN";
}

export function getTranslatorAutoloadSuffixes(
  targetLang: string,
  mode: "standard" | "intelligent" | "proofread",
): string[] {
  const preferred = getTranslatorOutputSuffix(targetLang, mode);
  const languageSuffixes = Object.values(TRANSLATOR_LANGUAGE_SUFFIX_MAP);
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

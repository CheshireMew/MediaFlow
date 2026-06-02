import { parseSRT } from "../../utils/subtitleParser";
import type { SubtitleSegment } from "../../types/task";
import { fileService } from "../../services/fileService";
import { TRANSLATION_TARGET_LANGUAGES } from "../../services/domain/translationTargetLanguages";

export const SUPPORTED_EDITOR_SUBTITLE_EXTENSIONS = [".srt"] as const;

export function isSupportedEditorSubtitlePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return SUPPORTED_EDITOR_SUBTITLE_EXTENSIONS.some((ext) =>
    normalized.endsWith(ext),
  );
}

/** Convert a local file path to a file:// URL, encoding all special characters including # */
export function pathToFileURL(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return `file:///${encodeURI(normalized).replace(/#/g, "%23")}`;
}

export async function loadEditorSubtitle(path: string) {
  const content = await fileService.readFile(path);
  if (!content) {
    return [];
  }

  return parseSRT(content);
}

export function buildRelatedSubtitleCandidates(videoPath: string): string[] {
  const priorities = [
    ...TRANSLATION_TARGET_LANGUAGES.map(({ suffix }) => suffix),
    "",
  ];
  const basePath = videoPath.replace(/\.[^.]+$/, "");
  return priorities.map((suffix) => `${basePath}${suffix}.srt`);
}

export function serializeEditorSubtitles(regions: SubtitleSegment[]): string {
  const formatTimestamp = (time: number) => {
    const date = new Date(0);
    date.setMilliseconds(time * 1000);
    return date.toISOString().substr(11, 12).replace(".", ",");
  };

  return regions
    .map((segment) => {
      return `${segment.id}\n${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}\n${segment.text || ""}\n`;
    })
    .join("\n");
}

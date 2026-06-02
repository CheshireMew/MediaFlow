import { getMediaExtensionsWithDot } from "../../contracts/openFileContract";
import { fileService } from "../fileService";
import { TRANSLATION_TARGET_LANGUAGES } from "../domain/translationTargetLanguages";

export const RELATED_VIDEO_EXTENSIONS = getMediaExtensionsWithDot("video");

export function stripTranslationLanguageSuffix(pathWithoutExtension: string): string {
  for (const { suffix } of TRANSLATION_TARGET_LANGUAGES) {
    if (pathWithoutExtension.endsWith(suffix)) {
      return pathWithoutExtension.slice(0, -suffix.length);
    }
  }
  return pathWithoutExtension;
}

export function buildRelatedVideoCandidatesForSubtitle(subtitlePath: string): string[] {
  const subtitleBasePath = subtitlePath.replace(/\.[^.]+$/, "");
  const basePath = stripTranslationLanguageSuffix(subtitleBasePath);
  const basePathAlreadyIncludesVideoExtension = RELATED_VIDEO_EXTENSIONS.some(
    (extension) => basePath.toLowerCase().endsWith(extension),
  );
  const mediaStemPath = basePathAlreadyIncludesVideoExtension
    ? basePath.replace(/\.[^.]+$/, "")
    : basePath;
  const candidates = RELATED_VIDEO_EXTENSIONS.map(
    (extension) => `${mediaStemPath}${extension}`,
  );

  return basePathAlreadyIncludesVideoExtension
    ? [basePath, ...candidates.filter((candidate) => candidate !== basePath)]
    : candidates;
}

export function formatRelatedVideoCandidateSummary(subtitlePath: string): string {
  const candidates = buildRelatedVideoCandidatesForSubtitle(subtitlePath);
  if (candidates.length === 0) {
    return subtitlePath;
  }

  const [firstCandidate, ...rest] = candidates;
  return `${firstCandidate}${rest.map((candidate) => `/${candidate.replace(/^.*(?=\.[^.]+$)/, "")}`).join("")}`;
}

export async function findRelatedVideoForSubtitle(
  subtitlePath: string,
): Promise<string | null> {
  for (const videoPath of buildRelatedVideoCandidatesForSubtitle(subtitlePath)) {
    try {
      const size = await fileService.getFileSize(videoPath);
      if (size && size > 0) {
        return videoPath;
      }
    } catch {
      // Ignore missing candidate files.
    }
  }

  return null;
}

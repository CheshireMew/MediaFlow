import { editorService, isDesktopRuntime } from "../../services/domain";
import {
  normalizeMediaReference,
  type MediaReference,
} from "../../services/ui/mediaReference";
import { getMediaExtensionsWithDot } from "../../contracts/openFileContract";
import { pathToFileURL } from "./editorFileHelpers";

const BROWSER_PREVIEW_VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".webm"]);
const APPLICATION_VIDEO_EXTENSIONS = new Set(getMediaExtensionsWithDot("video"));

function getPathExtension(path: string) {
  return path.match(/\.[^.\\/]+$/)?.[0]?.toLowerCase() ?? "";
}

export function canUseOriginalMediaUrlForEditorPreview(path: string): boolean {
  const extension = getPathExtension(path);
  return !APPLICATION_VIDEO_EXTENSIONS.has(extension) ||
    BROWSER_PREVIEW_VIDEO_EXTENSIONS.has(extension);
}

export async function resolveEditorPreviewMediaUrl(
  videoPath: string,
  videoRef?: MediaReference | null,
): Promise<string> {
  if (!isDesktopRuntime() || canUseOriginalMediaUrlForEditorPreview(videoPath)) {
    return pathToFileURL(videoPath);
  }

  try {
    const preview = await editorService.resolvePreviewMediaSource({
      video_ref: videoRef ?? normalizeMediaReference(videoPath)!,
    });
    return pathToFileURL(preview.media_ref.path);
  } catch (error) {
    console.error("[EditorPreview] Failed to resolve preview media source", error);
    return pathToFileURL(videoPath);
  }
}

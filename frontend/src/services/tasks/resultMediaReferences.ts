import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import { normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

type MediaSeed = {
  path: string;
  name?: string;
  size?: number;
  type?: string;
  media_id?: MediaReference["media_id"];
  media_kind?: MediaReference["media_kind"];
  role?: MediaReference["role"];
  origin?: MediaReference["origin"];
};

function chooseResultMediaRef(
  preferredRef?: MediaReference | null,
  secondaryRef?: MediaReference | null,
  seed?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const seedRef = normalizeMediaReference(seed);

  return (
    preferredRef ??
    secondaryRef ??
    seedRef
  );
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);

function normalizeVideoMediaReference(
  value?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const ref = normalizeMediaReference(value);
  if (!ref) return null;

  const mediaKind = typeof ref.media_kind === "string" ? ref.media_kind.toLowerCase() : "";
  const mimeType = typeof ref.type === "string" ? ref.type.toLowerCase() : "";
  const lowerPath = ref.path.toLowerCase();
  const hasVideoExtension = [...VIDEO_EXTENSIONS].some((extension) => lowerPath.endsWith(extension));

  return mediaKind === "video" || mimeType.startsWith("video/") || hasVideoExtension
    ? ref
    : null;
}

export function normalizeTranscribeResultMediaReferences(
  result: TranscribeResult | null,
  sourceFile?: MediaSeed | ElectronFile | null,
): TranscribeResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    video_ref: normalizeVideoMediaReference(result.video_ref) ?? normalizeVideoMediaReference(sourceFile),
    subtitle_ref: chooseResultMediaRef(result.subtitle_ref, null),
  };
}

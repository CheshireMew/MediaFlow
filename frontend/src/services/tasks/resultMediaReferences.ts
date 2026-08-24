import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import {
  isVideoMediaReference,
  normalizeMediaReference,
  type MediaReference,
} from "../ui/mediaReference";

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

function normalizeVideoMediaReference(
  value?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const ref = normalizeMediaReference(value);
  if (!ref) return null;

  return isVideoMediaReference(ref) ? ref : null;
}

export function normalizeTranscribeResult(
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
